/*
 * This file manages the abstract syntax tree for an sos file
 */

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
