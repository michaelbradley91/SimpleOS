/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import {
    createConnection,
    TextDocuments,
    Diagnostic,
    DiagnosticSeverity,
    ProposedFeatures,
    InitializeParams,
    DidChangeConfigurationNotification,
    CompletionItem,
    CompletionItemKind,
    TextDocumentPositionParams,
    TextDocumentSyncKind,
    InitializeResult,
    Position,
    SignatureHelpParams,
    SignatureHelp,
    ParameterInformation,
    DefinitionParams,
    DefinitionLink,
    HoverParams,
    Hover,
    MarkupKind
} from 'vscode-languageserver/node';
import {
    TextDocument
} from 'vscode-languageserver-textdocument';
import { CompilationResult, compile } from './compiler/src/compiler';
import { SemanticError, print_process_file_result } from './compiler/src/semantics';
import { readFileSync } from 'fs';
import path = require('node:path');
import { fileURLToPath, pathToFileURL } from 'url';
import { serialize } from 'v8';
import { FunctionType, Function_Token, Include_Token, OperationType, Operation_Token, StringLiteral_Token, Token, get_file_lines, get_file_lines_from_filesystem, set_get_file_lines, tokenise_file, tokenise_line } from './compiler/src/syntax';
import { ProgramHeader, parse_program_header } from './compiler/src/configuration';
import { isWhiteSpaceLike } from 'typescript';

// Create a connection for the server, using Node's IPC as a transport.
// Also include all preview / proposed LSP features.
const connection = createConnection(ProposedFeatures.all);

// Create a simple text document manager.
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = false;
let hasDiagnosticRelatedInformationCapability = false;

connection.onInitialize((params: InitializeParams) => {
    set_get_file_lines(get_file_lines_from_documents);
    const capabilities = params.capabilities;

    // Does the client support the `workspace/configuration` request?
    // If not, we fall back using global settings.
    hasConfigurationCapability = !!(
        capabilities.workspace && !!capabilities.workspace.configuration
    );
    hasWorkspaceFolderCapability = !!(
        capabilities.workspace && !!capabilities.workspace.workspaceFolders
    );
    hasDiagnosticRelatedInformationCapability = !!(
        capabilities.textDocument &&
        capabilities.textDocument.publishDiagnostics &&
        capabilities.textDocument.publishDiagnostics.relatedInformation
    );

    const result: InitializeResult = {
        capabilities: {
            textDocumentSync: TextDocumentSyncKind.Incremental,
            // Tell the client that this server supports code completion.
            completionProvider: {
                resolveProvider: true,
                triggerCharacters: ["#"]
            },
            signatureHelpProvider: {
                triggerCharacters: ['(', ","],
                retriggerCharacters: [','],
                workDoneProgress: false
            },
            definitionProvider: {
                workDoneProgress: false
            },
            hoverProvider: {
                workDoneProgress: false
            }
        }
    };
    if (hasWorkspaceFolderCapability) {
        result.capabilities.workspace = {
            workspaceFolders: {
                supported: true
            }
        };
    }
    return result;
});

connection.onInitialized(() => {
    if (hasConfigurationCapability) {
        // Register for all configuration changes.
        connection.client.register(DidChangeConfigurationNotification.type, undefined);
    }
    if (hasWorkspaceFolderCapability) {
        connection.workspace.onDidChangeWorkspaceFolders(_event => {
            return;
        });
    }
});

// The example settings
interface SimpleOSSettings {
    program_configuration: string;
}

// The global settings, used when the `workspace/configuration` request is not supported by the client.
// Please note that this is not the case when using this server with the client provided in this example
// but could happen with other clients.
const defaultSettings: SimpleOSSettings = { program_configuration: "" };
let globalSettings: SimpleOSSettings = defaultSettings;

// Cache the settings of all open documents
const documentSettings: Map<string, Thenable<SimpleOSSettings>> = new Map();

connection.onDidChangeConfiguration(change => {
    if (hasConfigurationCapability) {
        // Reset all cached document settings
        documentSettings.clear();
    } else {
        globalSettings = <SimpleOSSettings>(
            (change.settings.simpleOS || defaultSettings)
        );
    }

    // Revalidate all open text documents
    documents.all().forEach(validateTextDocument);
});

function getDocumentSettings(resource: string): Thenable<SimpleOSSettings> {
    if (!hasConfigurationCapability) {
        return Promise.resolve(globalSettings);
    }
    let result = documentSettings.get(resource);
    if (!result) {
        result = connection.workspace.getConfiguration({
            scopeUri: resource,
            section: 'simpleOS'
        });
        documentSettings.set(resource, result);
    }
    return result;
}

// Only keep settings for open documents
documents.onDidClose(e => {
    documentSettings.delete(e.document.uri);
});

// The content of a text document has changed. This event is emitted
// when the text document first opened or when its content has changed.
documents.onDidChangeContent(change => {
    validateTextDocument(change.document);
});

documents.onDidSave(change => {
    validateTextDocument(change.document);
});

function path_to_document_uri(file_path: string): string
{
    const all_uris = documents.keys();
    const resolved_file_path = path.resolve(file_path);
    for (let i = 0; i < all_uris.length; i++)
    {
        const document_path = path.resolve(fileURLToPath(new URL(all_uris[i])));
        if (document_path == resolved_file_path)
        {
            return all_uris[i];
        }
    }
    // Resort to the file system...
    return pathToFileURL(file_path).href;
}

export function get_file_lines_from_documents(file_path: string): string[] | null
{
    const all_uris = documents.keys();
    const resolved_file_path = path.resolve(file_path);
    for (let i = 0; i < all_uris.length; i++)
    {
        const document_path = path.resolve(fileURLToPath(new URL(all_uris[i])));
        if (document_path == resolved_file_path)
        {
            const contents: string | undefined = documents.get(all_uris[i])?.getText();
            if (contents)
            {
                return contents.split(/\r?\n/);
            }
        }
    }
    // Failing the above, try to load it from the filesystem
    return get_file_lines_from_filesystem(file_path);
}

export function document_uri_to_path(uri: string): string
{
    const document_url: URL = new URL(uri);
    const document_path: string = fileURLToPath(document_url);
    const program_path: string = path.resolve(document_path);
    return program_path;
}

export async function try_compile(document_uri: string): Promise<CompilationResult | null>
{
    // Piece together all the metadata we need for compilation
    const settings: SimpleOSSettings = await getDocumentSettings(document_uri);
    const program_path = document_uri_to_path(document_uri);
    const program_header: ProgramHeader = parse_program_header(settings.program_configuration);
    // Fix up the main binary so we only compile what we care about
    program_header.main = program_path;

    const lines = get_file_lines(program_path);
    if (!lines)
    {
        return null;
    }

    // Now do the compiling...
    return compile(program_header);
}

async function validateTextDocument(textDocument: TextDocument): Promise<void> {
    const diagnostics: Diagnostic[] = [];
    const text = textDocument.getText();
    
    const settings: SimpleOSSettings = await getDocumentSettings(textDocument.uri);
    if (!settings.program_configuration)
    {
        const diagnostic: Diagnostic = {
            severity: DiagnosticSeverity.Information,
            range: {
                start: textDocument.positionAt(0),
                end: textDocument.positionAt(text.length)
            },
            message: `Please set the Simple OS Program Configuration file in your settings to your JSON file`,
            source: 'Simple OS'
        };
        diagnostics.push(diagnostic);
        connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
        return;
    }
    const result = await try_compile(textDocument.uri);
    const program_path = document_uri_to_path(textDocument.uri);
    const lines = get_file_lines(program_path);
    if (!result || !lines)
    {
        const diagnostic: Diagnostic = {
            severity: DiagnosticSeverity.Error,
            range: {
                start: textDocument.positionAt(0),
                end: textDocument.positionAt(text.length)
            },
            message: `Error - current file not found. Something is wrong with this extension`,
            source: 'Simple OS'
        };
        diagnostics.push(diagnostic);
        connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
        return;
    }

    // Now do the compiling...
    const compilation_result: CompilationResult = result;
    const document_errors: Set<SemanticError> | undefined = compilation_result.process_file_result.errors.get(program_path);
    if (document_errors && document_errors.size > 0)
    {
        console.log("Errors found!");
        const all_errors = [...document_errors.values()];
        console.log(`Found this many errors: ${all_errors.length}`);
        all_errors.sort((a, b) => a.line < b.line ? -1 : 1);
        all_errors.forEach(error => {
            console.log(`Error at: ${error.line + 1}: ${error.message}`);
            const diagnostic: Diagnostic = {
                severity: DiagnosticSeverity.Error,
                range: {
                    start: textDocument.positionAt(textDocument.offsetAt(Position.create(error.line, 0))),
                    end: textDocument.positionAt(textDocument.offsetAt(Position.create(error.line, lines[error.line].length)))
                },
                message: error.message,
                source: "Simple OS"
            };
            diagnostics.push(diagnostic);
        });
    }
    // else no errors found!

    // Send the computed diagnostics to VSCode.
    connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
}

connection.onDidChangeWatchedFiles(_change => {
    // Monitored files have change in VSCode
    return;
});

export function has_whitespace(text: string): boolean
{
    return /\s/g.test(text);
}
/**
 * Get the currently written "word" at this position in the file
 * @param file_text the file we are searching
 * @param offset the offset into the file we are looking at
 * @param function_name are we looking for a function? If so, keep searching backwards until we see a bracket (this only works in basic scenarios)
 */
export function get_word_in_progress(file_text: string, offset: number, function_name = false): string
{
    let start = offset - 1;
    if (start >= file_text.length)
    {
        start = file_text.length - 1;
    }
    let current_word = "";
    let current_position = start;
    let found_function_start = false;
    while(current_position >= 0 && (!has_whitespace(file_text[current_position]) || function_name && !found_function_start))
    {
        if (file_text[current_position] == "(")
        {
            found_function_start = true;
        }
        current_word = file_text[current_position] + current_word;
        current_position--;
    }
    return current_word;
}

export function get_word_at(file_text: string, offset: number) {
    const left = file_text.slice(0, offset + 1).search(/[^\s(,:()]+$/);
    const right = file_text.slice(offset).search(/[\s(,:()]/);

    // The last word in the string is a special case.
    if (right < 0) {
        return file_text.slice(left);
    }

    return file_text.slice(left, right + offset);
}

const operation_names: string[] = [
    "nop", "store", "copy", "copy_indirect", "add", "mul", "sub", "div", "mod", "neq", "eq", "lt", "gt",
    "lte", "gte", "jmp", "xor", "or", "and", "not", "fill", "draw", "clear", "play_music", "stop_music",
    "play_sound", "get_event", "random", "wait", "exit", "get_mouse", "get_ticks"
];

const function_names: string[] = [
    "music","sound","sprite","colour","rect","key_pressed","key_released","mouse_pressed","mouse_released"
];
// Should line up with the functions above
const function_signatures: SignatureHelp[] = [
    {
        signatures: [
            {
                label: "music(path)",
                documentation: "Get the integer value of the music asset at the given path",
                parameters: [ParameterInformation.create("path", "The string path matching the asset path in your configuration JSON")]
            }
        ]
    },
    {
        signatures: [
            {
                label: "sound(path)",
                documentation: "Get the integer value of the sound asset at the given path",
                parameters: [ParameterInformation.create("path", "The string path matching the asset path in your configuration JSON")]
            }
        ]
    },
    {
        signatures: [
            {
                label: "sprite(path)",
                documentation: "Get the integer value of the sprite asset at the given path",
                parameters: [ParameterInformation.create("path", "The string path matching the asset path in your configuration JSON")]
            }
        ]
    },
    {
        signatures: [
            {
                label: "colour(r,g,b,a)",
                documentation: "Get the integer value corresponding to the given colour",
                parameters: [
                    ParameterInformation.create("r", "Red component 0 - 255"),
                    ParameterInformation.create("g", "Green component 0 - 255"),
                    ParameterInformation.create("b", "Blue component 0 - 255"),
                    ParameterInformation.create("a", "Alpha component 0 - 255. 255 is opaque"),
                ]
            }
        ]
    },
    {
        signatures: [
            {
                label: "rect(x,y,width,height)",
                documentation: "Get the integer value corresponding to the given rectangular area",
                parameters: [
                    ParameterInformation.create("x", "Top left x coordinate"),
                    ParameterInformation.create("y", "Top left y coordinate"),
                    ParameterInformation.create("width", "Rectangle width"),
                    ParameterInformation.create("height", "Rectangle height"),
                ]
            }
        ]
    },
    {
        signatures: [
            {
                label: "key_pressed(code)",
                documentation: "Get the integer value corresponding to the event of this key being pressed",
                parameters: [
                    ParameterInformation.create("code", "The key that was pressed")
                ]
            }
        ]
    },
    {
        signatures: [
            {
                label: "key_released(code)",
                documentation: "Get the integer value corresponding to the event of this key being released",
                parameters: [
                    ParameterInformation.create("code", "The key that was released")
                ]
            }
        ]
    },
    {
        signatures: [
            {
                label: "mouse_pressed(x,y,button)",
                documentation: "Get the integer value corresponding to the event of this mouse button being pressed",
                parameters: [
                    ParameterInformation.create("x", "The x coordinate where it was pressed"),
                    ParameterInformation.create("y", "The y coordinate where it was pressed"),
                    ParameterInformation.create("button", "The button that was pressed")
                ]
            }
        ]
    },
    {
        signatures: [
            {
                label: "mouse_released(x,y,button)",
                documentation: "Get the integer value corresponding to the event of this mouse button being released",
                parameters: [
                    ParameterInformation.create("x", "The x coordinate where it was released"),
                    ParameterInformation.create("y", "The y coordinate where it was released"),
                    ParameterInformation.create("button", "The button that was released")
                ]
            }
        ]
    },
];

const directive_names: string[] = [
    "#constant", "#include", "#template_begin", "#template_end"
];


connection.onDefinition(async (_definitionParams: DefinitionParams): Promise<DefinitionLink[] | undefined | null> => {
    const text_document = documents.get(_definitionParams.textDocument.uri);
    if (!text_document)
    {
        return null;
    }
    const text = text_document.getText();
    const offset = text_document.offsetAt(_definitionParams.position);
    const word = get_word_at(text, offset);

    const settings: SimpleOSSettings = await getDocumentSettings(_definitionParams.textDocument.uri);
    if (!settings.program_configuration)
    {
        return null;
    }
    const compilation_result = await try_compile(_definitionParams.textDocument.uri);
    if (!compilation_result)
    {
        return null;
    }

    // Check constants first...
    const all_constants = [...compilation_result.parser_context.constants.keys()];
    for (let i = 0; i < all_constants.length; i++)
    {
        if (all_constants[i] == word)
        {
            const constant_definition = compilation_result.parser_context.constants.get(all_constants[i]);
            if (constant_definition)
            {
                const documentUri = path_to_document_uri(constant_definition.file);
                const lines = get_file_lines(constant_definition.file);
                if (documentUri && lines)
                {
                    const definition_link: DefinitionLink = {
                        targetUri: documentUri,
                        targetRange: {
                            start: {
                                line: constant_definition.line,
                                character: 0
                            },
                            end: {
                                line: constant_definition.line,
                                character: lines[constant_definition.line].length
                            }
                        },
                        targetSelectionRange: {
                            start: {
                                line: constant_definition.line,
                                character: 0
                            },
                            end: {
                                line: constant_definition.line,
                                character: lines[constant_definition.line].length
                            }
                        }
                    };
                    return [definition_link];
                }
            }
        }
    }

    // Check templates...
    const all_templates = [...compilation_result.parser_context.templates.keys()];
    for (let i = 0; i < all_templates.length; i++)
    {
        if (all_templates[i] == word)
        {
            const template_definition = compilation_result.parser_context.templates.get(all_templates[i]);
            if (template_definition)
            {
                const documentUri = path_to_document_uri(template_definition.file);
                const lines = get_file_lines(template_definition.file);
                if (documentUri && lines)
                {
                    const definition_link: DefinitionLink = {
                        targetUri: documentUri,
                        targetRange: {
                            start: {
                                line: template_definition.line,
                                character: 0
                            },
                            end: {
                                line: template_definition.line,
                                character: lines[template_definition.line].length
                            }
                        },
                        targetSelectionRange: {
                            start: {
                                line: template_definition.line,
                                character: 0
                            },
                            end: {
                                line: template_definition.line,
                                character: lines[template_definition.line].length
                            }
                        }
                    };
                    return [definition_link];
                }
            }
        }
    }

    // Is this an include line?
    const lines = text.split(/\r?\n/);
    const tokenise_result = tokenise_file(lines);
    const line_tokens = tokenise_result.tokens[_definitionParams.position.line];
    if (line_tokens.find(token => token instanceof Include_Token))
    {
        // Has an include! Are we on the string?
        const string_token: Token | undefined = line_tokens.find(token => token instanceof StringLiteral_Token && 
            token.start_character <= _definitionParams.position.character && 
            token.end_character >= _definitionParams.position.character);
        if (string_token && string_token instanceof StringLiteral_Token)
        {
            // Yes, we are! Link it to the destination
            const program_configuration_parsed = path.parse(settings.program_configuration);
            const include_path = path.join(program_configuration_parsed.dir, string_token.text);
            const destination_uri = path_to_document_uri(include_path);
            const include_lines = get_file_lines(include_path);
            if (include_lines)
            {
                const definition_link: DefinitionLink = {
                    targetUri: destination_uri,
                    targetRange: {
                        start: {
                            line: 0,
                            character: 0
                        },
                        end: {
                            line: 0,
                            character: 0
                        }
                    },
                    targetSelectionRange: {
                        start: {
                            line: 0,
                            character: 0
                        },
                        end: {
                            line: 0,
                            character: 0
                        }
                    }
                };
                return [definition_link];
            }
        }
    }

    return null;
});

connection.onSignatureHelp(async (_signatureHelpParams: SignatureHelpParams): Promise<SignatureHelp | undefined | null> => {
    const text_document = documents.get(_signatureHelpParams.textDocument.uri);
    if (!text_document)
    {
        return null;
    }
    const text = text_document.getText();
    const offset = text_document.offsetAt(_signatureHelpParams.position);
    const current_word = get_word_in_progress(text, offset , true);
    for (let i = 0; i < function_names.length; i++)
    {
        if (current_word.startsWith(function_names[i]))
        {
            // TODO - fix parameter and function suggestion based on token evaluation if possible...
            function_signatures[i].activeParameter = (current_word.match(/,/g) || []).length;
            return function_signatures[i];
        }
    }
    const settings: SimpleOSSettings = await getDocumentSettings(_signatureHelpParams.textDocument.uri);
    if (!settings.program_configuration)
    {
        return null;
    }
    const compilation_result = await try_compile(_signatureHelpParams.textDocument.uri);
    if (!compilation_result)
    {
        return null;
    }
    // Check for templates
    const all_templates = [...compilation_result.parser_context.templates.keys()];
    for (let i = 0; i < all_templates.length; i++)
    {
        if (current_word.startsWith(all_templates[i]))
        {
            const template_definition = compilation_result.parser_context.templates.get(all_templates[i]);
            if (template_definition)
            {
                const string_args = [];
                const parameters: ParameterInformation[] = [];
                for (let i = 0; i < template_definition.arguments.length; i++)
                {
                    string_args.push(template_definition.arguments[i].name);
                    parameters.push(
                        {
                            label: template_definition.arguments[i].name
                        }
                    );
                }
                const template_label = all_templates[i] + "(" + string_args.join(",") + ")";
                
                const signature_help: SignatureHelp = {
                    signatures: [
                        {
                            label: template_label,
                            parameters: parameters,
                            activeParameter: (current_word.match(/,/g) || []).length
                        }
                    ]
                };
                return signature_help;
            }
        }
    }
    return null;
});

export function get_operation_markdown_description(operation_type: OperationType): string
{
    switch (operation_type)
    {
        case OperationType.Add:
            return "### `add <left addr> <right addr>`\nAdd the value in the left address to the \
value in the right address and write the result to the return address.";
        case OperationType.Bitwise_And:
            return "### `and <left addr> <right addr>`\nBitwise AND the value in the left address \
with the value in the right address and write the result to the return address.";
        case OperationType.Bitwise_Not:
            return "### `not <addr>`\nBitwise NOT the value in the address and write the result to the return address.";
        case OperationType.Bitwise_Or:
            return "### `or <left addr> <right addr>`\nBitwise OR the value in the left address with the value \
in the right address and write the result to the return address.";
        case OperationType.Bitwise_Xor:
            return "### `xor <left addr> <right addr>`\nBitwise XOR the value in the left address with the \
value in the right address and write the result to the return address.";
        case OperationType.Copy:
            return "### `copy <tgt addr> <src addr>`\nCopy the value at `src addr` to `tgt addr`";
        case OperationType.Copy_Indirect:
            // This takes some explaining...
            return "### `copy_indirect <tgt addr> <src addr>`\n\
Copy the value at the address stored in `src addr` to the address stored in `tgt addr`.\n\n\
Note the difference between this and copy - both addresses are dereferenced first. For example:\n\
```\n\
store 1 1\n\
store 2 2\n\
store 3 3\n\
store 4 4\n\
add 1 2\n\
store 5 RETURN\n\
add 1 3\n\
store 6 RETURN\n\
copy_indirect 5 6\n\
```\n\
\n\
Just before copy indirect, the memory looks like this:\n\
\n\
| 1 | 2 | 3 | 4 | 5 | 6 | ... | RETURN |\n\
| --- | --- | --- | --- | --- | --- | --- | --- |\n\
| 1 | 2 | 3 | 4 | 3 | 4 | ... | 4 |\n\
\n\
And just after the memory looks like this:\n\
\n\
| 1 | 2 | 3 | 4 | 5 | 6 | ... | RETURN |\n\
| --- | --- | --- | --- | --- | --- | --- | --- |\n\
| 1 | 2 | 4 | 4 | 3 | 4 | ... | 4 |\n\
\n\
Spot the difference? `Memory[3] = 4`. copy_indirect in pseudo code would look\n\
like this:\n\
\n\
```python\n\
# copy_indirect(src,tgt)\n\
\n\
src_addr = Memory[src]\n\
tgt_addr = Memory[tgt]\n\
\n\
src_val = Memory[src_addr]\n\
\n\
Memory[tgt_addr] = src_val\n\
```\n\
\n\
It may be your primary way to use calculated addresses in Simple OS.";
        case OperationType.Divide:
            return "### `div <left addr> <right addr>`\nDivide the value in the right address by the value \
in the left address, and write the result to the return address. (left / right)";
        case OperationType.Draw:
            return "### `draw <rectangle addr> <sprite index addr>`\nDraw the sprite referenced by the sprite \
index stored at the sprite index address in the rectangle stored in the rectangle address.\n\n\
The sprite is stretched to fill the rectangle.";
        case OperationType.Fill:
            return "### `fill <rectangle addr> <colour addr>`\nFill the rectangle stored in rectangle address \
with the colour stored in the colour address.";
        case OperationType.Is_Equal:
            return "### `eq <left addr> <right addr>`\nIf the value in the left address equals the value in \
the right address, write 1 to the return address. Otherwise, write 0 to the return address.";
        case OperationType.Is_Greater_Than:
            return "### `gt <left addr> <right addr>`\nIf the value in the left address is greater than the \
value in the right address, write 1 to the return address. Otherwise, write 0 to the return address.";
        case OperationType.Is_Greater_Than_Or_Equal:
            return "### `gte <left addr> <right addr>`\nIf the value in the left address is greater than or \
equal to the value in the right address, write 1 to the return address. Otherwise, write 0 to the return address.";
        case OperationType.Is_Less_Than:
            return "### `lt <left addr> <right addr>`\nIf the value in the left address is less than the value in \
the right address, write 1 to the return address. Otherwise, write 0 to the return address.";
        case OperationType.Is_Less_Than_Or_Equal:
            return "### `lte <left addr> <right addr>`\nIf the value in the left address is less than or equal to \
the value in the right address, write 1 to the return address. Otherwise, write 0 to the return address.";
        case OperationType.Is_Not_Equal:
            return "### `neq <left addr> <right addr>`\nIf the value in the left address does not equal the value \
in the right address, write 1 to the return address. Otherwise, write 0 to the return address.";
        case OperationType.Jump:
            return "### `jmp <cond addr> <tgt addr>`\nIf the value at `cond addr` is non-zero, jump to the address \
stored at `tgt addr` (not `tgt addr` itself). Otherwise do nothing.";
        case OperationType.Modulo:
            return "### `mod <left addr> <right addr>`\nWrite the value in the left address modulo the value \
in the right address to the return address. (left % right)";
        case OperationType.Multiply:
            return "### `mul <left addr> <right addr>`\nMultiply the value in the left address by the value in \
the right address and write the result to the return address.";
        case OperationType.Play_Music:
            return "### `play_music <volume addr> <music index addr>`\n\
Play the music referenced by the music index stored at the music index address at the volume stored in the volume address.\n\n\
The volume should be a number from 0 to 65535 and scales to decibels linearly.\n\n\
Only one music track can play at once. Music will automatically loop \
back to the beginning of the track when it reaches the end.";
        case OperationType.Play_Sound:
            return "### `play_sound <volume addr> <sound index addr>`\n\
Play the sound referenced by the sound index stored at the sound index address \
at the volume stored in the volume address.\n\n\
The volume should be a number from 0 to 65535 and scales to decibels linearly.\n\n\
A sound will play once and then stop.";
        case OperationType.Store:
            return "### `store <addr> <value>`\nStore value at the given address. This is your primary way to write values into memory.";
        case OperationType.Subtract:
            return "### `sub <left addr> <right addr>`\nSubtract the value in the right address from \
the value in the left address and write the result to the return address. (left - right)";
        case OperationType.Clear:
            return "### `clear <rectangle addr>`\nClear the screen with the \"screen default colour\" stored at address `-3` \
over the rectangle stored in the rectangle address.\n\n\
This is a shortcut to `fill` with the screen default colour";
        case OperationType.Wait:
            return "### `wait`\nPause execution until the next natural frame as dictated by the FPS setting.\n\n\
You should try to always include a wait in any event loop to avoid running the CPU hot.";
        case OperationType.Stop_Music:
            return "### `stop_music`\nStop playing any currently playing music.";
        case OperationType.No_Operation:
            return "### `nop`\nDoes nothing! You can use this to fill space I suppose.";
        case OperationType.Get_Event:
            return "### `get_event`\nGet an event from the event queue. This is either a mouse or keyboard event \
and you can use the built-in functions to help test against this.\n\n\
The encoded event is stored in the return address.";
        case OperationType.Random:
            return "### `random`\nGenerates a random 64 bit number and stores it in the return address.";
        case OperationType.Get_Mouse_Position:
            return "### `get_mouse`\nGet the mouse location and store the coordinates in the return address.";
        case OperationType.Get_Ticks:
            return "### `get_ticks`\nGet the number of milliseconds that have elapsed since the game started, \
(meaning since this program started, not since Simple OS started).";
        case OperationType.Exit:
            return "### `exit`\nExit the game. Immediately ends execution.";
    }
}

export function get_function_markdown_description(function_type: FunctionType): string
{
    switch (function_type)
    {
        case FunctionType.Colour:
            return "### `colour(r,g,b,a)`\nGenerate a single 64 bit integer containing the red, green, blue \
and alpha components in a colour.";
        case FunctionType.Key_Pressed:
            return "### `key_pressed(keycode)`\nGenerate a single 64 bit integer in the form of an event \
for the given keycode being pressed. This keycode matches the Godot keycodes.";
        case FunctionType.Key_Released:
            return "### `key_released(keycode)`\nGenerate a single 64 bit integer in the form of an event \
for the given keycode being released. This keycode matches the Godot keycodes.";
        case FunctionType.Mouse_Pressed:
            return "### `mouse_pressed(x,y,button)`\nGenerate a single 64 bit integer in the form of an event \
for the given mouse button being pressed at the (x,y) position. The mouse button matches the Godot button code.";
        case FunctionType.Mouse_Released:
            return "### `mouse_released(x,y,button)`\nGenerate a single 64 bit integer in the form of an event \
for the given mouse button being released at the (x,y) position. The mouse button matches the Godot button code.";
        case FunctionType.Music:
            return "### `music(\"path\")`\nGet the index of the music at the given path. `path` should match \
exactly what is written in the program's configuration.";
        case FunctionType.Rectangle:
            return "### `rect(x,y,width,height)`\nGenerate a single 64 bit integer representing the given rectangle, \
whose top left coordinates are (x,y)";
        case FunctionType.Sound:
            return "### `sound(\"path\")`\nGet the index of the sound at the given path. `path` should match \
exactly what is written in the program's configuration.";
        case FunctionType.Sprite:
            return "### `sprite(\"path\")`\nGet the index of the sprite at the given path. `path` should match \
exactly what is written in the program's configuration.";
    }
}

connection.onHover(
    async (_hoverParams: HoverParams): Promise<Hover | null | undefined> => {
        const text_document = documents.get(_hoverParams.textDocument.uri);
        if (!text_document)
        {
            return null;
        }
        const text = text_document.getText();
        const lines = text.split(/\r?\n/);
        const tokenise_result = tokenise_file(lines);
        const line_tokens = tokenise_result.tokens[_hoverParams.position.line];

        // Are we hovering over an operation token?
        const operation_token: Token | undefined = line_tokens.find(token => token instanceof Operation_Token && 
            token.start_character <= _hoverParams.position.character && 
            token.end_character >= _hoverParams.position.character);
        
        if (operation_token && operation_token instanceof Operation_Token)
        {
            const result: Hover = {
                contents: {
                    kind: MarkupKind.Markdown,
                    value: get_operation_markdown_description(operation_token.operation)
                }
            };
            return result;
        }

        // Are we hovering over a function token?
        const function_token: Token | undefined = line_tokens.find(token => token instanceof Function_Token && 
            token.start_character <= _hoverParams.position.character && 
            token.end_character >= _hoverParams.position.character);
        
        if (function_token && function_token instanceof Function_Token)
        {
            const result: Hover = {
                contents: {
                    kind: MarkupKind.Markdown,
                    value: get_function_markdown_description(function_token.type)
                }
            };
            return result;
        }
        return null;
    }
);

// This handler provides the initial list of the completion items.
connection.onCompletion(
    async (_textDocumentPosition: TextDocumentPositionParams): Promise<CompletionItem[]> => {
        // Figure out what the user is typing...
        const text_document = documents.get(_textDocumentPosition.textDocument.uri);
        if (!text_document) {
            return [];
        }
        const offset = text_document.offsetAt(_textDocumentPosition.position);
        const text = text_document.getText();
        const current_word = get_word_in_progress(text, offset);

        const completion_items: CompletionItem[] = [];
        for (let i = 0; i < operation_names.length; i++)
        {
            if (operation_names[i].startsWith(current_word))
            {
                completion_items.push({
                    label: operation_names[i],
                    kind: CompletionItemKind.Operator,
                    data: i
                });
            }
        }
        for (let i = 0; i < function_names.length; i++)
        {
            if (function_names[i].startsWith(current_word))
            {
                completion_items.push({
                    label: function_names[i],
                    kind: CompletionItemKind.Function,
                    data: i
                });
            }
        }
        for (let i = 0; i < directive_names.length; i++)
        {
            if (directive_names[i].startsWith(current_word))
            {
                completion_items.push({
                    // Not entirely sure why, but VSCode completes these with the # added back in
                    label: directive_names[i].slice(1),
                    kind: CompletionItemKind.Keyword,
                    data: i
                });
            }
        }
        const settings: SimpleOSSettings = await getDocumentSettings(_textDocumentPosition.textDocument.uri);
        if (!settings.program_configuration)
        {
            return completion_items;
        }
        const compilation_result = await try_compile(_textDocumentPosition.textDocument.uri);
        if (!compilation_result)
        {
            return completion_items;
        }
        // Check the constants and templates...
        const all_constants = [...compilation_result.parser_context.constants.keys()];
        for (let i = 0; i < all_constants.length; i++)
        {
            if (all_constants[i].startsWith(current_word))
            {
                completion_items.push({
                    // Not entirely sure why, but VSCode completes these with the # added back in
                    label: all_constants[i],
                    kind: CompletionItemKind.Constant,
                    data: i
                });
            }
        }
        const all_templates = [...compilation_result.parser_context.templates.keys()];
        for (let i = 0; i < all_templates.length; i++)
        {
            if (all_templates[i].startsWith(current_word))
            {
                completion_items.push({
                    // Not entirely sure why, but VSCode completes these with the # added back in
                    label: all_templates[i],
                    kind: CompletionItemKind.Method,
                    data: i
                });
            }
        }

        return completion_items;
    }
);

// This handler resolves additional information for the item selected in
// the completion list.
connection.onCompletionResolve(
    (item: CompletionItem): CompletionItem => {
        if (item.kind === CompletionItemKind.Keyword) {
            item.detail = directive_names[item.data];
            item.documentation = directive_names[item.data];
        } else if (item.kind === CompletionItemKind.Function) {
            item.detail = function_names[item.data];
            item.documentation = function_names[item.data];
        } else if (item.kind === CompletionItemKind.Operator) {
            item.detail = operation_names[item.data];
            item.documentation = operation_names[item.data];
        }
        return item;
    }
);

// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

// Listen on the connection
connection.listen();
