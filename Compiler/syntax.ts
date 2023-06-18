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
export class Macro {
    name: string
    arguments: string[]
    body: string
}

// A label that can be used to refer to an address in the code
export class Label {
    name: string
}

export class LabelInvoked {
    name: string
}

// The use of a define somewhere
export class DefineInvoked {
    name: string
}

export class MacroInvoked {
    name: string
    arguments: string[]
}

export class Comment {
    text: string
    constructor(text: string) {
        this.text = text;
    }
}

export class Command
{
    operation: string = "";
}
