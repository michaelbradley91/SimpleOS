/*
 * This file manages the abstract syntax tree for an sos file
 */

// All regexes should apply from the start to ensure we
// match everything correctly
const MultiLineComment_Start_Regex = /^\/*/g;
const SingleLineComment_Regex = /^(\/\/).*$/g;
const Operator_Regex = /^(nop|store|copy|add|mul|sub|div|mod|neq|eq|lt|gt|lte|gte|jmp|xor|or|and|not|fill|draw|clear|play_music|stop_music|play_sound|get_event|wait|exit|get_mouse)\s+/g;
const Function_Regex = /^(music|sound|sprite|colour|rect|key_pressed|key_released|mouse_pressed|mouse_released)(\([^\)\(]*\))/g;
const MacroEnd_Regex = /^(#macro_end)(\s|$)/g;
const MacroBegin_Regex = /^(#macro_begin)($|\s+([^ \(\)]+)?(\([^\)\(]*\))?)/g;
const Define_Regex = /^(#define)($|\s+([^ \(\)]+))/g;
const Label_Regex = /^.+:/g;
const Include_Regex = /^#include(\s|$)/g;
const Number_Regex = /^\s*(?<=[^$])((0(x|X)[0-9a-fA-F]+)|([0-9]+))/g;
const String_Regex = /^"[^"]*"/g;
// Any other function looking thing is assumed to be a macro invoked unless proven otherwise
const MacroInvoked_Regex = /^([^ \(\)]+)(\([^\)\(]*\))/g;
// Finally, any other word like thing is assumed to be a define unless proven otherwise
const DefineInvoked_Regex = /^([^ \(\)]+)/g;
const Whitespace_Regex = /^(\s*)/g;

export class MultiLineComment {
    comment: string

    constructor(comment: string) {
        this.comment = comment;
    }
}

export class SingleLineComment {
    comment: string

    constructor(comment: string) {
        this.comment = comment;
    }
}

export class Include {
    path: string

    constructor(path: string) {
        this.path = path
    }
}

// A define copies one symbol to another
export class Define {
    name: string
    value: string

    constructor(name: string, value: string)
    {
        this.name = name;
        this.value = value;
    }
}

// A macro is parameterised and can insert a whole chunk of text
export class MacroBegin {
    name: string
    arguments: string[]

    constructor(name: string, args: string[]) {
        this.name = name;
        this.arguments = args;
    }
}

export class MacroEnd {
    constructor() {}
}

// A label that can be used to refer to an address in the code
export class Label {
    name: string

    constructor(name: string) {
        this.name = name;
    }
}

export class LabelInvoked {
    name: string

    constructor(name: string) {
        this.name = name;
    }
}

// The use of a define somewhere
export class DefineInvoked {
    name: string

    constructor(name: string) {
        this.name = name;
    }
}

export class MacroInvoked {
    name: string
    arguments: string[]

    constructor(name: string, args: string[]) {
        this.name = name;
        this.arguments = args;
    }
}

export class Comment {
    text: string
    constructor(text: string) {
        this.text = text;
    }
}

export class NumberLiteral {
    value: number
    constructor(value: number) {
        this.value = value;
    }
}

export class StringLiteral {
    text: string
    constructor(text: string) {
        this.text = text;
    }
}

// Represent anything the parser does not recognise
export class Unknown {
    text: string
    constructor(text: string) {
        this.text = text;
    }
}

enum FunctionType {
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

enum OperationType {
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
    Full = "fill",
    Draw = "draw",
    Clear = "clear",
    Play_Music = "play_music",
    Stop_Music = "stop_music",
    Play_Sound = "play_sound",
    Get_Event = "get_event",
    Wait = "wait",
    Exit = "exit",
    Get_Mouse_Position = "get_mouse"
}


// Functions are simple in this language, not allowing for recursive function calls
type FunctionArgument = StringLiteral | NumberLiteral | DefineInvoked;

enum FunctionArgumentType {
    String,
    Number,
    Define
}

export class Function
{
    type: FunctionType;
    argument_types: FunctionArgumentType[];
    arguments: FunctionArgument[];

    constructor(type: FunctionType, argument_types: FunctionArgumentType[], args: FunctionArgument[]) {
        this.type = type;
        this.argument_types = argument_types;
        this.arguments = args;
    }
}

type OperationArgument = LabelInvoked | DefineInvoked | NumberLiteral | StringLiteral | Function;

enum OperationArgumentType {
    Label,
    Define,
    Number,
    String,
    Function
}

export class Operation
{
    operation: OperationType;
    argument_types: OperationArgumentType[];
    arguments: OperationArgument[];

    constructor(operation: OperationType, argument_types: OperationArgumentType[], args: OperationArgument[])
    {
        this.operation = operation;
        this.argument_types = argument_types;
        this.arguments = args;
    }
}

/*
 * What can be in a parsed line?
 * 
 * It could have any number of comment blocks
 * It's pretty complicated actually...
 */

export class TokenResult {
    tokens: any[];
    existing_comment_block: MultiLineComment | null;

    constructor(tokens: any[], existing_comment_block: MultiLineComment | null)
    {
        this.tokens = tokens;
        this.existing_comment_block = existing_comment_block;
    }
}

/**
 * Turn a single line of text into a list of tokens.
 * @param line the line to tokenise
 * @param inside_block_comment if we are inside a comment block already
 */
export function tokenise_line(line: string, existing_comment_block: MultiLineComment | null): TokenResult
{
    var previous_position: number = 0;
    var current_position: number = 0;
    // If we are still in a comment block, we can keep looking for the end of it...
    if (!!existing_comment_block)
    {
        var end_of_comment_block: number = line.indexOf("*/");
        if (end_of_comment_block >= 0)
        {
            current_position += end_of_comment_block + 2;
            existing_comment_block.comment += line.slice(0, end_of_comment_block);
        }
        else
        {
            existing_comment_block.comment += line;
            return new TokenResult([], existing_comment_block);
        }
    }

    var tokens: any[] = [];
    // We are now at the end of the previous comment block. Continue matching from here as normal
    while (!!line)
    {
        line = line.slice(current_position - previous_position);
        previous_position = current_position;
        if (!line)
        {
            break;
        }
        // Order we check matches in is important
        var matches = [...line.matchAll(Whitespace_Regex)];
        if (!!matches) {
            // Ignore whitespace
            current_position += matches[0].length;
            continue;
        }

        matches = [...line.matchAll(Operator_Regex)];
        if (!!matches) {
            // For now we do not try to parse the rest of the operator's arguments. We'll sanitise the arguments later
            current_position += matches[0].length;
            tokens.push(new Operation(OperationType.Add, [], []));
            continue;
        }

        matches = [...line.matchAll(Function_Regex)];
        if (!!matches) {
            current_position += matches[0].length;
            tokens.push(new Function(FunctionType.Colour, [], []));
            continue;
        }

        matches = [...line.matchAll(Label_Regex)];
        if (!!matches) {
            current_position += matches[0].length;
            tokens.push(new Label(""));
            continue;
        }

        matches = [...line.matchAll(Number_Regex)];
        if (!!matches) {
            current_position += matches[0].length;
            tokens.push(new NumberLiteral(0));
            continue;
        }

        matches = [...line.matchAll(String_Regex)];
        if (!!matches) {
            current_position += matches[0].length;
            tokens.push(new StringLiteral(""));
            continue;
        }

        matches = [...line.matchAll(MacroBegin_Regex)];
        if (!!matches) {
            current_position += matches[0].length;
            tokens.push(new MacroBegin("", []));
            continue;
        }

        matches = [...line.matchAll(MacroEnd_Regex)];
        if (!!matches) {
            current_position += matches[0].length;
            tokens.push(new MacroEnd());
            continue;
        }

        matches = [...line.matchAll(Define_Regex)];
        if (!!matches) {
            current_position += matches[0].length;
            tokens.push(new Define("", ""));
            continue;
        }

        matches = [...line.matchAll(Include_Regex)];
        if (!!matches) {
            current_position += matches[0].length;
            tokens.push(new Include(""));
            continue;
        }

        matches = [...line.matchAll(SingleLineComment_Regex)];
        if (!!matches) {
            current_position += matches[0].length;
            tokens.push(new SingleLineComment(""));
            continue;
        }

        matches = [...line.matchAll(MultiLineComment_Start_Regex)];
        if (!!matches) {
            current_position += matches[0].length;
            tokens.push(new MultiLineComment(""));
            continue;
        }

        matches = [...line.matchAll(MacroInvoked_Regex)];
        if (!!matches) {
            current_position += matches[0].length;
            tokens.push(new MacroInvoked("", []));
            continue;
        }

        matches = [...line.matchAll(DefineInvoked_Regex)];
        if (!!matches)
        {
            current_position += matches[0].length;
            tokens.push(new DefineInvoked(""));
            continue;
        }

        tokens.push(new Unknown(line));
        current_position += line.length;
    }
    return new TokenResult(tokens, null);
}
