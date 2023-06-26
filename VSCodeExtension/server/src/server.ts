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
} from 'vscode-languageserver/node';

import {
	TextDocument
} from 'vscode-languageserver-textdocument';
import { CompilationResult, compile, compile_with_program_header } from './compiler/src/compiler';
import { SemanticError, print_process_file_result } from './compiler/src/semantics';
import { readFileSync } from 'fs';
import path = require('node:path');
import { fileURLToPath, pathToFileURL } from 'url';
import { serialize } from 'v8';
import { get_file_lines, get_file_lines_from_filesystem, set_get_file_lines } from './compiler/src/syntax';
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
			connection.console.log('Workspace folder change event received.');
		});
	}
});

// The example settings
interface SimpleOSSettings {
	working_directory: string;
	program_configuration: string;
}

// The global settings, used when the `workspace/configuration` request is not supported by the client.
// Please note that this is not the case when using this server with the client provided in this example
// but could happen with other clients.
const defaultSettings: SimpleOSSettings = { working_directory: "", program_configuration: "" };
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

function get_file_lines_from_documents(file_path: string): string[] | null
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
    const working_directory = path.dirname(settings.program_configuration);
	set_get_file_lines(get_file_lines_from_documents);
	const lines = get_file_lines(program_path);
	if (!lines)
	{
		return null;
	}

	// Now do the compiling...
	return compile_with_program_header(program_path, program_header, working_directory);
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
			console.log(`Error at: ${error.line}: ${error.message}`);
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
	else
	{
		console.log("No errors found!");
	}

	// Send the computed diagnostics to VSCode.
	connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
}

connection.onDidChangeWatchedFiles(_change => {
	// Monitored files have change in VSCode
	connection.console.log('We received an file change event');
});

export function has_whitespace(text: string): boolean
{
	return /\s/g.test(text);
}
/**
 * Get the currently written "word" at this position in the file
 * @param file_text the file we are searching
 * @param offset the offset into the file we are looking at
 */
export function get_word_in_progress(file_text: string, offset: number): string
{
	let start = offset - 1;
	if (start >= file_text.length)
	{
		start = file_text.length - 1;
	}
	let current_word = "";
	let current_position = start;
	while(current_position >= 0 && !has_whitespace(file_text[current_position]))
	{
		current_word = file_text[current_position] + current_word;
		current_position--;
	}
	return current_word;
}

const operation_names: string[] = [
	"nop", "store", "copy", "add", "mul", "sub", "div", "mod", "neq", "eq", "lt", "gt",
	"lte", "gte", "jmp", "xor", "or", "and", "not", "fill", "draw", "clear", "play_music", "stop_music",
	"play_sound", "get_event", "wait", "exit", "get_mouse"
];

const function_names: string[] = [
	"music","sound","sprite","colour","rect","key_pressed","key_released","mouse_pressed","mouse_released"
];

const directive_names: string[] = [
	"#define", "#include", "#macro_begin", "#macro_end"
];

// This handler provides the initial list of the completion items.
connection.onCompletion(
	async (_textDocumentPosition: TextDocumentPositionParams): Promise<CompletionItem[]> => {
		// Figure out what the user is typing...
		console.log("Looking for completion items");
		const text_document = documents.get(_textDocumentPosition.textDocument.uri);
		if (!text_document) {
			return [];
		}
		console.log("Auto complete line " + _textDocumentPosition.position.line.toString() + " character " + _textDocumentPosition.position.character.toString());
		const offset = text_document.offsetAt(_textDocumentPosition.position);
		console.log("Seems to be at position " + offset.toString());
		const text = text_document.getText();
		console.log("Text here and around is: ", text.slice(offset - 5, offset + 5));
		console.log("Text right here is: ", text[offset]);
		console.log("Text before here is: ", text[offset - 1]);
		console.log("Got document text with length " + text.length.toString());
		const current_word = get_word_in_progress(text, offset);
		console.log("Current word seems to be " + current_word);

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
		console.log("Trying dummy compile...");
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
		console.log("Got a compilation result we can use");
		// Check the defines and macros...
		const all_defines = [...compilation_result.parser_context.defines.keys()];
		console.log("Found defines: " + all_defines.toString());
		for (let i = 0; i < all_defines.length; i++)
		{
			if (all_defines[i].startsWith(current_word))
			{
				completion_items.push({
					// Not entirely sure why, but VSCode completes these with the # added back in
					label: all_defines[i],
					kind: CompletionItemKind.Constant,
					data: i
				});
			}
		}
		const all_macros = [...compilation_result.parser_context.macros.keys()];
		console.log("Found macros: " + all_macros.toString());
		for (let i = 0; i < all_macros.length; i++)
		{
			if (all_macros[i].startsWith(current_word))
			{
				console.log("Suggesting macro " + all_macros[i]);
				completion_items.push({
					// Not entirely sure why, but VSCode completes these with the # added back in
					label: all_macros[i],
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
