/**
 * This file manages the abstract syntax tree for an sos file
 */

import { readFileSync } from "fs";

// All regexes should apply from the start to ensure we
// match everything correctly
const MultiLineComment_Start_Regex = /^\/\*/g;
const SingleLineComment_Regex = /^\/\/(.*)$/g;
const Operator_Regex = /^(nop|store|copy|add|mul|sub|div|mod|neq|eq|lt|gt|lte|gte|jmp|xor|or|and|not|fill|draw|clear|play_music|stop_music|play_sound|get_event|get_ticks|wait|exit|get_mouse)(?=(\s|$))/g;
const Function_Regex = /^(music|sound|sprite|colour|rect|key_pressed|key_released|mouse_pressed|mouse_released)(?=\([^)(]*\))/g;
const TemplateEnd_Regex = /^(#template_end)(?=\s|$)/g;
const TemplateBegin_Regex = /^#template_begin($|\s+([^ :,()]+)?(?=\([^)(]*\))?)/g;
const Constant_Regex = /^#constant($|\s+([^ :,()]+))/g;
const Label_Regex = /^[^ :,()]+:(b|f)?/g;
const Include_Regex = /^#include(\s|$)/g;
const Number_Regex = /^(-?(0(x|X)[0-9a-fA-F]+)|([0-9]+))/g;
const String_Regex = /^"([^"]*)"/g;
// Any other function looking thing is assumed to be a template invoked unless proven otherwise
const TemplateInvoked_Regex = /^([^ :,()]+)(?=\([^)(]*\))/g;
// Finally, any other word like thing is assumed to be a constant unless proven otherwise
const ConstantInvoked_Regex = /^([^ :,()]+)/g;
const Comma_Regex = /^,/g;
const OpenBracket_Regex = /^\(/g;
const CloseBracket_Regex = /^\)/g;
const Whitespace_Regex = /^(\s+)/g;

export function getEnumKeyByEnumValue<
  TEnumKey extends string,
  TEnumVal extends string | number
>(myEnum: { [key in TEnumKey]: TEnumVal }, enumValue: TEnumVal): string {
  const keys = (Object.keys(myEnum) as TEnumKey[]).filter(
    (x) => myEnum[x] === enumValue,
  );
  return keys.length > 0 ? keys[0] : '';
}

export class Token {}

export class MultiLineComment_Token extends Token {
    comment: string;

    constructor(comment: string) {
        super();
        this.comment = comment;
    }
}

export class SingleLineComment_Token extends Token {
    comment: string;

    constructor(comment: string) {
        super();
        this.comment = comment;
    }
}

export class Include_Token extends Token {
    constructor() {
        super();
    }
}

// A constant copies one symbol to another
export class Constant_Token extends Token {
    name: string;

    constructor(name: string) {
        super();
        this.name = name;
    }
}

// A template is parameterised and can insert a whole chunk of text
export class TemplateBegin_Token extends Token {
    name: string;

    constructor(name: string) {
        super();
        this.name = name;
    }
}

export class TemplateEnd_Token extends Token {
    constructor() {
        super();
    }
}

// A label that can be used to refer to an address in the code
export class Label_Token extends Token {
    name: string;

    constructor(name: string) {
        super();
        this.name = name;
    }
}

export class Label extends Label_Token {
    line: number;
    file: string;

    constructor(name: string, line: number, file: string)
    {
        super(name);
        this.line = line;
        this.file = file;
    }
}

// The use of a constant somewhere
export class ConstantInvoked_Token extends Token {
    name: string;

    constructor(name: string) {
        super();
        this.name = name;
    }
}

export class TemplateInvoked_Token extends Token {
    name: string;

    constructor(name: string) {
        super();
        this.name = name;
    }
}

export class Comment_Token extends Token {
    text: string;
    constructor(text: string) {
        super();
        this.text = text;
    }
}

export class NumberLiteral_Token extends Token {
    value: bigint;
    constructor(value: bigint) {
        super();
        this.value = value;
    }
}

export class StringLiteral_Token extends Token {
    text: string;
    start_character: number;
    end_character: number;
    constructor(text: string, start_character: number, end_character: number) {
        super();
        this.text = text;
        this.start_character = start_character;
        this.end_character = end_character;
    }
}

export class Comma_Token extends Token {
    constructor() {
        super();
    }
}

export class OpenBracket_Token extends Token {
    constructor() {
        super();
    }
}

export class CloseBracket_Token extends Token {
    constructor() {
        super();
    }
}

// Represent anything the parser does not recognise
export class Unknown_Token extends Token {
    text: string;
    constructor(text: string) {
        super();
        this.text = text;
    }
}

export enum FunctionType {
    Music = "music",
    Sound = "sound",
    Sprite = "sprite",
    Colour = "colour",
    Rectangle = "rect",
    Key_Pressed = "key_pressed",
    Key_Released = "key_released",
    Mouse_Pressed = "mouse_pressed",
    Mouse_Released = "mouse_released"
}

export enum OperationType {
    No_Operation = "nop",
    Store = "store",
    Copy = "copy",
    Add = "add",
    Multiply = "mul",
    Subtract = "sub",
    Divide = "div",
    Modulo = "mod",
    Is_Not_Equal = "neq",
    Is_Equal = "eq",
    Is_Less_Than = "lt",
    Is_Greater_Than = "gt",
    Is_Less_Than_Or_Equal = "lte",
    Is_Greater_Than_Or_Equal = "gte",
    Jump = "jmp",
    Bitwise_Xor = "xor",
    Bitwise_Or = "or",
    Bitwise_And = "and",
    Bitwise_Not = "not",
    Fill = "fill",
    Draw = "draw",
    Clear = "clear",
    Play_Music = "play_music",
    Stop_Music = "stop_music",
    Play_Sound = "play_sound",
    Get_Event = "get_event",
    Wait = "wait",
    Exit = "exit",
    Get_Mouse_Position = "get_mouse",
    Get_Ticks = "get_ticks"
}

function enumFromStringValue<T> (enm: { [s: string]: T}, value: string): T | undefined {
    return (Object.values(enm) as unknown as string[]).includes(value)
        ? value as unknown as T
        : undefined;
}

// Functions are simple in this language, not allowing for recursive function calls
type FunctionArgument = StringLiteral_Token | NumberLiteral_Token | ConstantInvoked_Token;

enum FunctionArgumentType {
    String,
    Number,
    Constant
}

export class Function_Token
{
    type: FunctionType;

    constructor(type: FunctionType) {
        this.type = type;
    }
}

type OperationArgument = Label_Token | ConstantInvoked_Token | NumberLiteral_Token | StringLiteral_Token | Function_Token;

enum OperationArgumentType {
    Label,
    Constant,
    Number,
    String,
    Function
}

export class Operation_Token
{
    operation: OperationType;

    constructor(operation: OperationType)
    {
        this.operation = operation;
    }
}

/*
 * What can be in a parsed line?
 * 
 * It could have any number of comment blocks
 * It's pretty complicated actually...
 */

export class TokenLineResult {
    tokens: Token[];
    existing_comment_block: MultiLineComment_Token | null;

    constructor(tokens: Token[], existing_comment_block: MultiLineComment_Token | null)
    {
        this.tokens = tokens;
        this.existing_comment_block = existing_comment_block;
    }
}

export class TokenFileResult {
    // Tokens ordered by line number. Note that for multi-line comments, the line span can be recovered from \n's in the line
    tokens: Token[][];
    
    constructor(tokens: Token[][]) {
        this.tokens = tokens;
    }
}

/**
 * Turn a single line of text into a list of tokens.
 * @param line the line to tokenise
 * @param inside_block_comment if we are inside a comment block already
 */
export function tokenise_line(line: string, existing_comment_block: MultiLineComment_Token | null): TokenLineResult
{
    let previous_position = 0;
    let current_position = 0;
    // If we are still in a comment block, we can keep looking for the end of it...
    if (existing_comment_block)
    {
        const end_of_comment_block: number = line.indexOf("*/");
        if (end_of_comment_block >= 0)
        {
            current_position += end_of_comment_block + 2;
            existing_comment_block.comment += line.slice(0, end_of_comment_block);
        }
        else
        {
            existing_comment_block.comment += line + "\n";
            return new TokenLineResult([], existing_comment_block);
        }
    }

    const tokens: Token[] = [];
    // We are now at the end of the previous comment block. Continue matching from here as normal
    while (line)
    {
        line = line.slice(current_position - previous_position);
        previous_position = current_position;
        if (!line)
        {
            break;
        }

        // The order we check matches in is important
        let matches: RegExpMatchArray = [...line.matchAll(Whitespace_Regex)][0];
        if (matches) {
            // Ignore whitespace
            current_position += matches[0].length;
            continue;
        }

        matches = [...line.matchAll(Operator_Regex)][0];
        if (matches) {
            // For now we do not try to parse the rest of the operator's arguments. We'll sanitise the arguments later
            current_position += matches[0].length;
            const operation_type = enumFromStringValue(OperationType, matches[1]);
            if (operation_type)
            {
                tokens.push(new Operation_Token(operation_type));
            }
            continue;
        }

        matches = [...line.matchAll(Function_Regex)][0];
        if (matches) {
            // Same story, we ignore the arguments detail for now
            current_position += matches[0].length;
            const function_type = enumFromStringValue(FunctionType, matches[1]);
            if (function_type)
            {
                tokens.push(new Function_Token(function_type));
            }
            continue;
        }

        matches = [...line.matchAll(Label_Regex)][0];
        if (matches) {
            current_position += matches[0].length;
            tokens.push(new Label_Token(matches[0]));
            continue;
        }

        matches = [...line.matchAll(Number_Regex)][0];
        if (matches) {
            current_position += matches[0].length;
            tokens.push(new NumberLiteral_Token(BigInt(matches[0])));
            continue;
        }

        matches = [...line.matchAll(String_Regex)][0];
        if (matches) {
            current_position += matches[0].length;
            tokens.push(new StringLiteral_Token(matches[1], current_position - matches[0].length, current_position));
            continue;
        }

        matches = [...line.matchAll(TemplateBegin_Regex)][0];
        if (matches) {
            current_position += matches[0].length;
            tokens.push(new TemplateBegin_Token(matches[2]));
            continue;
        }

        matches = [...line.matchAll(TemplateEnd_Regex)][0];
        if (matches) {
            current_position += matches[0].length;
            tokens.push(new TemplateEnd_Token());
            continue;
        }

        matches = [...line.matchAll(Constant_Regex)][0];
        if (matches) {
            current_position += matches[0].length;
            tokens.push(new Constant_Token(matches[2]));
            continue;
        }

        matches = [...line.matchAll(Include_Regex)][0];
        if (matches) {
            current_position += matches[0].length;
            tokens.push(new Include_Token());
            continue;
        }

        matches = [...line.matchAll(SingleLineComment_Regex)][0];
        if (matches) {
            current_position += matches[0].length;
            tokens.push(new SingleLineComment_Token(matches[1]));
            continue;
        }

        matches = [...line.matchAll(MultiLineComment_Start_Regex)][0];
        if (matches) {
            current_position += matches[0].length;
            // This puts us into more of a mess. We search the rest of the line for the closing
            // comment. If we fail to find it, we return and say it is continuing.
            const end_position = line.indexOf("*/", 2);
            if (end_position >= 0)
            {
                const comment: string = line.slice(2, end_position);
                current_position += end_position + 2 - matches[0].length;
                tokens.push(new MultiLineComment_Token(comment));
            }
            else
            {
                // Otherwise this comment is continuing onto the next line
                const comment_block = new MultiLineComment_Token(line.slice(2) + "\n");
                tokens.push(comment_block);
                return new TokenLineResult(tokens, comment_block);
            }
            continue;
        }

        matches = [...line.matchAll(TemplateInvoked_Regex)][0];
        if (matches) {
            current_position += matches[0].length;
            tokens.push(new TemplateInvoked_Token(matches[1]));
            continue;
        }

        matches = [...line.matchAll(ConstantInvoked_Regex)][0];
        if (matches)
        {
            current_position += matches[0].length;
            tokens.push(new ConstantInvoked_Token(matches[1]));
            continue;
        }

        matches = [...line.matchAll(Comma_Regex)][0];
        if (matches)
        {
            current_position += matches[0].length;
            tokens.push(new Comma_Token());
            continue;
        }

        matches = [...line.matchAll(OpenBracket_Regex)][0];
        if (matches)
        {
            current_position += matches[0].length;
            tokens.push(new OpenBracket_Token());
            continue;
        }

        matches = [...line.matchAll(CloseBracket_Regex)][0];
        if (matches)
        {
            current_position += matches[0].length;
            tokens.push(new CloseBracket_Token());
            continue;
        }

        tokens.push(new Unknown_Token(line));
        current_position += line.length;
    }
    return new TokenLineResult(tokens, null);
}

export function get_file_lines_from_filesystem(file_path: string): string[] | null
{
    try
    {
        const contents = readFileSync(file_path, 'utf-8');
        return contents.split(/\r?\n/);
    } catch(e)
    {
        return null;
    }
}


let get_file_lines_callback: (path: string) => string[] | null;

/**
 * Choose how to get the lines of a file.
 * When running as a VSCode extension, we have to get the files from the editor since they may not have been
 * saved yet.
 */
export function set_get_file_lines(callback: (path: string) => string[] | null)
{
    get_file_lines_callback = callback;
}

export function get_file_lines(file_path: string): string[] | null
{
    return get_file_lines_callback(file_path);
}

export function tokenise_file(file_lines: string[]): TokenFileResult
{
    const tokens: Token[][] = [];
    let existing_multi_comment_block: MultiLineComment_Token | null = null;
    file_lines.forEach(line => 
    {
        const result: TokenLineResult = tokenise_line(line, existing_multi_comment_block);

        if (result.existing_comment_block)
        {
            existing_multi_comment_block = result.existing_comment_block;
        }
        else
        {
            existing_multi_comment_block = null;
        }
        tokens.push(result.tokens);
    });

    return new TokenFileResult(tokens);
}
