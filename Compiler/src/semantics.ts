/**
 * This file handles the semantic interpretation of the language
 * This uses the tokenised form of the file to interpret it
 */

import { start } from "repl";
import { CloseBracket_Token, Comma_Token, DefineInvoked_Token, Define_Token, FunctionType, Function_Token, Include_Token, Label, Label_Token, MacroBegin_Token, MacroEnd_Token, MacroInvoked_Token, MultiLineComment_Token, NumberLiteral_Token, OpenBracket_Token, OperationType, Operation_Token, SingleLineComment_Token, StringLiteral_Token, Token, TokenFileResult, get_file_lines, tokenise_file } from "./syntax";
import { error } from "console";
import path from "path";
import { ProgramHeader } from "./configuration";

/**
 * Return the tokens for the file with all comments removed
 * @param token_file_result the original tokens of the file
 */
function strip_comments(token_file_result: TokenFileResult): TokenFileResult
{
    var stripped_tokens: Token[][] = [];
    token_file_result.tokens.forEach(line_tokens => {
        var stripped_line_tokens = []
        stripped_tokens.push(stripped_line_tokens);
        line_tokens.forEach(token => {
            if (!(token instanceof SingleLineComment_Token || token instanceof MultiLineComment_Token))
            {
                stripped_line_tokens.push(token)
            }
        });
    });
    return new TokenFileResult(stripped_tokens);
}

/* 
 * ****************************************************************************
 * All functions below this point assume the file has been stripped of comments
 * ****************************************************************************
 */

/**
 * Represents a semantic error of any kind
 */
export class SemanticError
{
    line: number
    message: string

    constructor(line: number, message: string)
    {
        this.line = line;
        this.message = message;
    }
}

class MacroContext {
    variables: Define_Token[];

    constructor(variables: Define_Token[])
    {
        this.variables = variables;
    }
}

/**
 * Identify the list of tokens that make up a "value". Returns all the tokens involved
 * or none if it could not be found
 * @param tokens the list of tokens to extract the value from
 */
export function identify_value(tokens: Token[]): Token[]
{
    if (tokens.length == 0) return [];

    // If this is a function or a macro, look for the arguments
    if (tokens[0] instanceof Function_Token || tokens[0] instanceof MacroInvoked_Token || tokens[0] instanceof MacroBegin_Token)
    {
        // one of the predefined functions. Should be followed by some number of argument values itself
        if (tokens.length < 2 || !(tokens[1] instanceof OpenBracket_Token)) {
            return [];
        }
        var current_token = 2;
        if (tokens.length > current_token && tokens[current_token] instanceof CloseBracket_Token)
        {
            return tokens.slice(0, current_token + 1);
        }

        while(tokens.length > current_token)
        {
            var argument_tokens = identify_value(tokens.slice(current_token));
            if (argument_tokens.length == 0) return [];
            current_token += argument_tokens.length;

            // An argument should be followed either by a closing bracket or a comma.
            if (tokens.length > current_token)
            {
                if (tokens[current_token] instanceof CloseBracket_Token)
                {
                    return tokens.slice(0, current_token + 1);
                }
                if (tokens[current_token] instanceof Comma_Token)
                {
                    current_token += 1;
                }
            }
        }
        // Failed to find the end of the arguments list
        return [];
    }

    // If this is normal value, just return it
    if (tokens[0] instanceof DefineInvoked_Token ||
        tokens[0] instanceof Label_Token ||
        tokens[0] instanceof NumberLiteral_Token ||
        tokens[0] instanceof StringLiteral_Token)
    {
        return tokens.slice(0, 1);
    }

    return [];
}

/**
 * Validate that the file has a sensible syntax
 * 
 * Some rules:
 * 
 * 1. Defines can only include "value" types.
 * 
 * This is anything that essentially evaluates to an integer or string. So for example:
 * rect(1,3,40,50)
 * Would be okay. Use of other defines is okay (but will need resolving)
 * 
 * 2. Macro arguments are "value" types as well
 * 
 * In other words they act exactly like "defines" inside the macro body.
 * This means a macro argument cannot be used as a command itself
 * 
 * 3. Macros are lists of commands
 * 
 * They will always be a list of commands, not part of a command etc.
 * This implies their invocation only makes sense at the start of a line.
 * 
 * This function verifies that macros contain the right sort of commands, that includes
 * look okay etc.
 */
export function validate_basic_token_structure(result: TokenFileResult): SemanticError[]
{
    var errors: SemanticError[] = [];
    var macro_context: boolean = false;
    for (var line_number = 0; line_number < result.tokens.length; line_number++)
    {
        var line_tokens = result.tokens[line_number];
        if (line_tokens.length == 0) continue;

        // Firstly, a token at the start of a line must be an approved token
        // This implies that macros must be blocks of lines, which they are required to be
        var start_token = line_tokens[0];
        if (!(start_token instanceof Operation_Token || 
            start_token instanceof Define_Token || 
            start_token instanceof MacroInvoked_Token ||
            start_token instanceof Include_Token ||
            start_token instanceof MacroBegin_Token ||
            start_token instanceof MacroEnd_Token ||
            start_token instanceof Label_Token))
        {
            errors.push(new SemanticError(line_number, "Line should begin with an operation, macro, define, label, or include."));
            continue;
        }

        // Inside a macro we disable a bunch of other statements as well
        if (macro_context) {
            if (start_token instanceof Define_Token || 
                start_token instanceof Include_Token || 
                start_token instanceof MacroBegin_Token)
            {
                errors.push(new SemanticError(line_number, "Line inside a macro should begin with an operation or label"));
                continue;
            }
        }

        // What should be on the line? Lets start with tokens that should be followed by nothing
        if (start_token instanceof Label_Token)
        {
            // No other tokens should be present on a line beginning with a label (after comments are removed)
            if (line_tokens.length > 1)
            {
                errors.push(new SemanticError(line_number, "A label should not be followed by anything."));
                continue;
            }
        }

        if (start_token instanceof MacroEnd_Token)
        {
            // No other tokens should be present on a line ending a macro (after comments are removed)
            if (line_tokens.length > 1)
            {
                errors.push(new SemanticError(line_number, "A macro end statement should not be followed by anything."));
                continue;
            }
            // Check we are in a macro context
            if (!macro_context)
            {
                errors.push(new SemanticError(line_number, "end_macro without a begin_macro"));
                continue;
            }
            // End the context
            macro_context = false;
        }

        if (start_token instanceof Include_Token)
        {
            // For includes we do not support defines or anything besides the string path for simplicity
            if (line_tokens.length !=2 || !(line_tokens[1] instanceof StringLiteral_Token))
            {
                errors.push(new SemanticError(line_number, "Include statement can only be followed by a single string"));
                continue;
            }
        }

        if (start_token instanceof Define_Token)
        {
            if (line_tokens.length < 2)
            {
                errors.push(new SemanticError(line_number, "Define not given a value"));
                continue;
            }

            // We need to consume a value after the define
            var value_tokens = identify_value(line_tokens.slice(1));
            if (value_tokens.length == 0)
            {
                errors.push(new SemanticError(line_number, "Could not identify define value"));
                continue;
            }

            // There should be no remaining tokens on the line
            if (line_tokens.length != 1 + value_tokens.length)
            {
                errors.push(new SemanticError(line_number, "Additional arguments found after define"));
                continue;
            }
        }
        
        // Allow for some number of value arguments
        if (start_token instanceof Operation_Token)
        {
            var current_token = 1;
            while(current_token < line_tokens.length)
            {
                var value_tokens = identify_value(line_tokens.slice(current_token));
                if (value_tokens.length == 0)
                {
                    errors.push(new SemanticError(line_number, "Could not identify operation argument"));
                    break;
                }
                current_token += value_tokens.length;
            }
            continue;
        }

        if (start_token instanceof MacroBegin_Token)
        {
            // We only allow brackets, defines and commas after a macro begin token
            var value_tokens = identify_value(line_tokens);
            if (value_tokens.length == 0)
            {
                errors.push(new SemanticError(line_number, "Could not identify macro definition"));
                continue;
            }
            // Check all the tokens are what we expect
            for (var value_token_index = 1; value_token_index < value_tokens.length; value_token_index += 1)
            {
                if (!(value_tokens[value_token_index] instanceof Comma_Token ||
                    value_tokens[value_token_index] instanceof OpenBracket_Token ||
                    value_tokens[value_token_index] instanceof CloseBracket_Token ||
                    value_tokens[value_token_index] instanceof DefineInvoked_Token))
                {
                    errors.push(new SemanticError(line_number, "Macro arguments should have a unique name like defines"));
                    break;
                }
            }
            if (value_tokens.length != line_tokens.length)
            {
                errors.push(new SemanticError(line_number, "Excess code seen after macro definition. The definition should be on its own line"));
                continue;
            }
            macro_context = true;
            continue;
        }

        if (start_token instanceof MacroInvoked_Token)
        {
            var value_tokens = identify_value(line_tokens);
            if (value_tokens.length == 0)
            {
                errors.push(new SemanticError(line_number, "Could not identify arguments to macro invocation"));
                continue;
            }
            if (value_tokens.length != line_tokens.length)
            {
                errors.push(new SemanticError(line_number, "Excess arguments after macro invocation"));
                continue;
            }
        }
    }

    return errors;
}

/**
 * Represents the definition of a macro for the parser context
 */
export class MacroDefinition
{
    arguments: DefineInvoked_Token[];
    tokens: Token[][];

    constructor(args: DefineInvoked_Token[], tokens: Token[][])
    {
        this.arguments = args;
        this.tokens = tokens;
    }
}

/**
 * Information about the parser as it processes the file
 */
export class ParserContext
{
    defines: Map<string, ConstantValue> = new Map<string, ConstantValue>();
    macros: Map<string, MacroDefinition> = new Map<string, MacroDefinition>();
    music: Map<string, number> = new Map<string, number>();
    sounds: Map<string, number> = new Map<string, number>();
    sprites: Map<string, number> = new Map<string, number>();
    line: number = 0;

    // Where include paths are resolved from. This is from where the main program resides
    working_directory: string = ".";
    // The files currently in the include stack. This is used to detect cycles
    include_stack: string[] = [];
    // The current macro stack. This is also used to detect cycles
    macro_stack: string[] = [];
    // A macro definition is currently in use
    active_macro: string | null = null;
    // The file currently being parsed
    active_file: string = "";

    constructor() {}
}

/**
 * The different kinds of values allowed in the program
 * 
 * Note that labels do eventually resolve to a number - the text address - but since
 * we can jump forward or backward to a label, we leave evaluation of labels until the end
 * after the program's code has been expanded.
 */
export enum ConstantValueType
{
    Error,
    Number,
    Label,
    String
}

/**
 * The value of a constant of some kind that has been evaluated
 */
export class ConstantValue
{
    type: ConstantValueType
    tokens: Token[];
    data: SemanticError | bigint | string;
    error: SemanticError | null = null;
    value: bigint | null = null;
    text: string | null = null;

    constructor(tokens: Token[], data: SemanticError | bigint | string)
    {
        this.tokens = tokens;
        this.data = data;
        if (data instanceof SemanticError)
        {
            this.type = ConstantValueType.Error;
            this.error = data;
        }
        else if (typeof data == "string")
        {
            if (data.endsWith(":") || data.endsWith(":f") || data.endsWith(":b"))
            {
                this.type = ConstantValueType.Label;
            }
            else
            {
                this.type = ConstantValueType.String;
            }
            this.text = data;
        }
        else
        {
            this.type = ConstantValueType.Number;
            this.value = data;
        }
    }
}

function evaluate_colour(args: ConstantValue[], parser_context: ParserContext): ConstantValue
{
    var usage_string = "Usage: colour(r,g,b,a) all between 0 and 255"
    var usage_error = new ConstantValue([], new SemanticError(parser_context.line, usage_string));
    if (args.length != 4)
    {
        return usage_error;
    }
    
    args.forEach(arg => {
        if (arg.type != ConstantValueType.Number)
        {
            return usage_error;
        }
        if (arg.value < 0n || arg.value > 255n)
        {
            return usage_error;
        }
    });

    // All arguments are valid! Evaluate...
    var value: bigint = 0n;
    value += args[3].value & 0xFFn;
    value += ((args[2].value & 0xFFn) << (1n * 8n))
    value += ((args[1].value & 0xFFn) << (2n * 8n))
    value += ((args[0].value & 0xFFn) << (3n * 8n))
    return new ConstantValue([], value);
}

enum EventTypes {
    Mouse_Button_Pressed = 1,
    Mouse_Button_Released = 2,
    Key_Pressed = 3,
    Key_Released = 4
}

function evaluate_key_pressed(args: ConstantValue[], parser_context: ParserContext): ConstantValue
{
    var usage_string = "Usage: key_pressed(key_code)"
    var usage_error = new ConstantValue([], new SemanticError(parser_context.line, usage_string));

    if (args.length != 1)
    {
        return usage_error;
    }
    
    args.forEach(arg => {
        if (arg.type != ConstantValueType.Number)
        {
            return usage_error;
        }
        if (arg.value < 0n || arg.value > 0xFFFFFFFFFFFFn)
        {
            return usage_error;
        }
    });

    var value: bigint = args[0].value
    value = value & 0xFFFFFFFFFFFFn;
    value += BigInt(EventTypes.Key_Pressed) << (6n * 8n);
	return new ConstantValue([], value);
}

function evaluate_key_released(args: ConstantValue[], parser_context: ParserContext): ConstantValue
{
    var usage_string = "Usage: key_released(key_code)"
    var usage_error = new ConstantValue([], new SemanticError(parser_context.line, usage_string));

    if (args.length != 1)
    {
        return usage_error;
    }
    
    args.forEach(arg => {
        if (arg.type != ConstantValueType.Number)
        {
            return usage_error;
        }
        if (arg.value < 0n || arg.value > 0xFFFFFFFFFFFFn)
        {
            return usage_error;
        }
    });

    var value: bigint = args[0].value
    value = value & 0xFFFFFFFFFFFFn;
    value += BigInt(EventTypes.Key_Released) << (6n * 8n);
	return new ConstantValue([], value);
}

function evaluate_mouse_pressed(args: ConstantValue[], parser_context: ParserContext): ConstantValue
{
    var usage_string = "Usage: mouse_pressed(x, y, button)"
    var usage_error = new ConstantValue([], new SemanticError(parser_context.line, usage_string));

    if (args.length != 3)
    {
        return usage_error;
    }
    
    args.forEach(arg => {
        if (arg.type != ConstantValueType.Number)
        {
            return usage_error;
        }
        if (arg.value < 0n || arg.value > 0xFFFFn)
        {
            return usage_error;
        }
    });

    var value: bigint = args[2].value
    value = value & 0xFFFFn;
    value += ((args[1].value & 0xFFFFn) << (2n * 8n))
    value += ((args[0].value & 0xFFFFn) << (4n * 8n))
    value += BigInt(EventTypes.Mouse_Button_Pressed) << (6n * 8n);
	return new ConstantValue([], value);
}

function evaluate_mouse_released(args: ConstantValue[], parser_context: ParserContext): ConstantValue
{
    var usage_string = "Usage: mouse_released(x, y, button)"
    var usage_error = new ConstantValue([], new SemanticError(parser_context.line, usage_string));

    if (args.length != 3)
    {
        return usage_error;
    }
    
    args.forEach(arg => {
        if (arg.type != ConstantValueType.Number)
        {
            return usage_error;
        }
        if (arg.value < 0n || arg.value > 0xFFFFn)
        {
            return usage_error;
        }
    });

    var value: bigint = args[2].value
    value = value & 0xFFFFn;
    value += ((args[1].value & 0xFFFFn) << (2n * 8n))
    value += ((args[0].value & 0xFFFFn) << (4n * 8n))
    value += BigInt(EventTypes.Mouse_Button_Released) << (6n * 8n);
	return new ConstantValue([], value);
}

function evaluate_music(args: ConstantValue[], parser_context: ParserContext): ConstantValue
{
    var usage_string = "Usage: music(\"my_music\")"
    var usage_error = new ConstantValue([], new SemanticError(parser_context.line, usage_string));

    if (args.length != 3)
    {
        return usage_error;
    }
    
    args.forEach(arg => {
        if (arg.type != ConstantValueType.String)
        {
            return usage_error;
        }
        if (!parser_context.music.has(arg.text))
        {
            return new ConstantValue([], new SemanticError(parser_context.line, "music not found"));
        }
    });

    return parser_context.music[args[0].text];
}

function evaluate_sound(args: ConstantValue[], parser_context: ParserContext): ConstantValue
{
    var usage_string = "Usage: sound(\"my_sound\")"
    var usage_error = new ConstantValue([], new SemanticError(parser_context.line, usage_string));

    if (args.length != 3)
    {
        return usage_error;
    }
    
    args.forEach(arg => {
        if (arg.type != ConstantValueType.String)
        {
            return usage_error;
        }
        if (!parser_context.sounds.has(arg.text))
        {
            return new ConstantValue([], new SemanticError(parser_context.line, "sound not found"));
        }
    });

    return parser_context.sounds[args[0].text];
}

function evaluate_sprite(args: ConstantValue[], parser_context: ParserContext): ConstantValue
{
    var usage_string = "Usage: sprite(\"my_sprite\")"
    var usage_error = new ConstantValue([], new SemanticError(parser_context.line, usage_string));

    if (args.length != 3)
    {
        return usage_error;
    }
    
    args.forEach(arg => {
        if (arg.type != ConstantValueType.String)
        {
            return usage_error;
        }
        if (!parser_context.sprites.has(arg.text))
        {
            return new ConstantValue([], new SemanticError(parser_context.line, "sprite not found"));
        }
    });

    return parser_context.sprites[args[0].text];
}

function evaluate_rectangle(args: ConstantValue[], parser_context: ParserContext): ConstantValue
{
    var usage_string = "Usage: rect(x, y, width, height)"
    var usage_error = new ConstantValue([], new SemanticError(parser_context.line, usage_string));

    if (args.length != 4)
    {
        return usage_error;
    }
    
    args.forEach(arg => {
        if (arg.type != ConstantValueType.Number)
        {
            return usage_error;
        }
        if (arg.value < 0n || arg.value > 0xFFFFn)
        {
            return usage_error;
        }
    });

    var value: bigint = 0n
	value += args[3].value & 0xFFFFn;
    value += (args[2].value & 0xFFFFn) << (2n * 8n);
    value += (args[1].value & 0xFFFFn) << (4n * 8n);
    value += (args[0].value & 0xFFFFn) << (6n * 8n);
    return new ConstantValue([], value);
}

/**
 * Evaluate a specific function with the given arguments
 * 
 * To keep things simple, since labels cannot be easily evaluated until the program is expanded, they are not permitted
 * as arguments to functions.
 * 
 * Note: the tokens returned in the value will be wrong here, since we don't have comma tokens etc. This should be fixed by
 * the caller.
 * 
 * @param token - the function token we are evaluating
 * @param args - the arguments passed to the function
 * @param parser_context - the parser's current context
 */
export function evaluate_function(token: Function_Token, args: ConstantValue[], parser_context: ParserContext): ConstantValue
{
    // Check for any args we would always reject
    args.forEach(arg => {
        if (arg.type == ConstantValueType.Label || arg.type == ConstantValueType.Error)
        {
            return new ConstantValue([], new SemanticError(parser_context.line, `Bad arguments to function ${token.type}`));
        }
    });

    // Now for the individual functions...
    switch(token.type)
    {
        case FunctionType.Colour:
            return evaluate_colour(args, parser_context);
        case FunctionType.Key_Pressed:
            return evaluate_key_pressed(args, parser_context);
        case FunctionType.Key_Released:
            return evaluate_key_released(args, parser_context);
        case FunctionType.Mouse_Pressed:
            return evaluate_mouse_pressed(args, parser_context);
        case FunctionType.Mouse_Released:
            return evaluate_mouse_released(args, parser_context);
        case FunctionType.Music:
            return evaluate_music(args, parser_context);
        case FunctionType.Sound:
            return evaluate_sound(args, parser_context);
        case FunctionType.Sprite:
            return evaluate_sprite(args, parser_context);
        case FunctionType.Rectangle:
            return evaluate_rectangle(args, parser_context);
        default:
            return new ConstantValue([], new SemanticError(parser_context.line, "Unsupported function type"));
    }
}

/**
 * Evaluate a "value" in the language according to the parser context
 * @param tokens the tokens making up the "value" type
 */
export function evaluate_value(tokens: Token[], parser_context: ParserContext): ConstantValue
{
    if (tokens.length == 0) return new ConstantValue([], new SemanticError(parser_context.line, "No value found"));

    // If this is a function or a macro, look for the arguments
    if (tokens[0] instanceof Function_Token)
    {
        var included_tokens: Token[] = [];
        var args: ConstantValue[] = [];

        // one of the predefined functions. Should be followed by some number of argument values itself
        if (tokens.length < 2 || !(tokens[1] instanceof OpenBracket_Token)) {
            return new ConstantValue([], new SemanticError(parser_context.line, "Open bracket for function not found"));
        }
        var current_token = 2;
        if (tokens.length > current_token && tokens[current_token] instanceof CloseBracket_Token)
        {
            // No arguments - evaluate the function
            var result = evaluate_function(tokens[0], [], parser_context);
            result.tokens = tokens.slice(0, 3);
            return result;
        }
        else
        {
            while(tokens.length > current_token)
            {
                var arg = evaluate_value(tokens.slice(current_token), parser_context);
                if (arg.tokens.length == 0) {
                    return new ConstantValue([], new SemanticError(parser_context.line, "Improperly terminated arguments provided to function"));
                }
                current_token += arg.tokens.length;
                args.push(arg);

                // An argument should be followed either by a closing bracket or a comma.
                if (tokens.length > current_token)
                {
                    if (tokens[current_token] instanceof CloseBracket_Token)
                    {
                        included_tokens = tokens.slice(0, current_token + 1);
                        
                        var result = evaluate_function(tokens[0], args, parser_context);
                        result.tokens = included_tokens;
                        return result;
                    }
                    if (tokens[current_token] instanceof Comma_Token)
                    {
                        current_token += 1;
                    }
                }
            }
            // Failed to find the end of the arguments list
            return new ConstantValue([], new SemanticError(parser_context.line, "Improperly terminated arguments provided to function"));
        }
    }

    // If this is a normal value, just return it
    var used_tokens = tokens.slice(0, 1);
    if (tokens[0] instanceof DefineInvoked_Token)
    {
        if (parser_context.defines.has(tokens[0].name))
        {
            var define_value = parser_context.defines.get(tokens[0].name);
            return new ConstantValue(used_tokens, define_value.data);
        }
        else
        {
            return new ConstantValue(used_tokens, new SemanticError(parser_context.line, "Unknown define \"" + tokens[0].name + "\""));
        }
    }
    if (tokens[0] instanceof Label_Token)
    {
        return new ConstantValue(used_tokens, tokens[0].name);
    }
    if (tokens[0] instanceof NumberLiteral_Token)
    {
        return new ConstantValue(used_tokens, tokens[0].value);
    }
    if (tokens[0] instanceof StringLiteral_Token)
    {
        return new ConstantValue(used_tokens, tokens[0].text);
    }
    return new ConstantValue([], new SemanticError(parser_context.line, "Unrecognised value"));
}

/**
 * Calculate the arguments being passed to a function.
 * The argument tokens should begin where the open bracket begin, so (x,y,z) should be in the token list.
 * 
 * @param argument_tokens the tokens that make up the arguments
 * @param parser_context the current parser context
 * @returns a list of the values being passed to this function
 */
export function evaluate_arguments(tokens: Token[], parser_context: ParserContext): ConstantValue[]
{
    var args: ConstantValue[] = [];

    // one of the predefined functions. Should be followed by some number of argument values itself
    if (tokens.length < 1 || !(tokens[0] instanceof OpenBracket_Token)) {
        return [new ConstantValue([], new SemanticError(parser_context.line, "Open bracket for function not found"))];
    }
    var current_token = 1;
    if (tokens.length > current_token && tokens[current_token] instanceof CloseBracket_Token)
    {
        // No arguments - evaluate the function
        return [];
    }
    else
    {
        while(tokens.length > current_token)
        {
            var arg = evaluate_value(tokens.slice(current_token), parser_context);
            if (arg.tokens.length == 0) {
                return [new ConstantValue([], new SemanticError(parser_context.line, "Improperly terminated arguments provided to function"))];
            }
            current_token += arg.tokens.length;
            args.push(arg);

            // An argument should be followed either by a closing bracket or a comma.
            if (tokens.length > current_token)
            {
                if (tokens[current_token] instanceof CloseBracket_Token)
                {
                    return args;
                }
                if (tokens[current_token] instanceof Comma_Token)
                {
                    current_token += 1;
                }
            }
        }
        // Failed to find the end of the arguments list
        return [new ConstantValue([], new SemanticError(parser_context.line, "Improperly terminated arguments provided to function"))];
    }
}

/**
 * How instructions are written into machine code.
 * This should match Godot's interpretation
 */
enum InstructionType
{
	NOP = 0,
	STORE = 1,
	COPY = 2,
	ADD = 3,
	MULTIPLY = 4,
	SUBTRACT = 5,
	DIVIDE = 6,
	IS_NOT_EQUAL = 7,
	IS_EQUAL = 8,
	IS_LESS_THAN = 9,
	IS_GREATER_THAN = 10,
	IS_LESS_THAN_OR_EQUAL = 11,
	IS_GREATER_THAN_OR_EQUAL = 12,
	JUMP = 13,
	MODULO = 14,
	BITWISE_XOR = 15,
	BITWISE_OR = 16,
	BITWISE_AND = 17,
	BITWISE_NOT = 18,
	DRAW_COLOUR = 19,
	DRAW_SPRITE = 20,
	DRAW_CLEAR = 21,
	MUSIC_PLAY = 22,
	MUSIC_STOP = 23,
	SOUND_PLAY = 24,
	GET_EVENT = 25,
	WAIT_FRAME = 26,
	EXIT = 27,
	GET_MOUSE_POSITION = 28
}

/**
 * Represents the instructions in the final parsed form of the code
 */
export class Instruction
{
    type: OperationType;
    arg1: bigint | Label;
    arg2: bigint | Label;

    constructor(type: OperationType, arg1: bigint | Label, arg2: bigint | Label)
    {
        this.type = type;
        this.arg1 = arg1;
        this.arg2 = arg2;
    }
}

export type InstructionOrLabel = Instruction | Label

export class ProcessFileResult
{
    success: boolean = false;
    errors: Map<string, Set<SemanticError>> = new Map<string, Set<SemanticError>>();
    instructions: InstructionOrLabel[] = [];
}

export function operation_to_instructon(operation: OperationType): InstructionType
{
    switch (operation)
    {
        case OperationType.Add:
            return InstructionType.ADD;
        case OperationType.Bitwise_And:
            return InstructionType.BITWISE_AND;
        case OperationType.Bitwise_Or:
            return InstructionType.BITWISE_OR;
        case OperationType.Bitwise_Xor:
            return InstructionType.BITWISE_XOR;
        case OperationType.Copy:
            return InstructionType.COPY;
        case OperationType.Divide:
            return InstructionType.DIVIDE;
        case OperationType.Draw:
            return InstructionType.DRAW_SPRITE;
        case OperationType.Fill:
            return InstructionType.DRAW_COLOUR;
        case OperationType.Is_Equal:
            return InstructionType.IS_EQUAL;
        case OperationType.Is_Greater_Than:
            return InstructionType.IS_GREATER_THAN;
        case OperationType.Is_Greater_Than_Or_Equal:
            return InstructionType.IS_GREATER_THAN_OR_EQUAL;
        case OperationType.Is_Less_Than:
            return InstructionType.IS_LESS_THAN;
        case OperationType.Is_Less_Than_Or_Equal:
            return InstructionType.IS_LESS_THAN_OR_EQUAL;
        case OperationType.Is_Not_Equal:
            return InstructionType.IS_NOT_EQUAL;
        case OperationType.Jump:
            return InstructionType.JUMP;
        case OperationType.Modulo:
            return InstructionType.MODULO;
        case OperationType.Multiply:
            return InstructionType.MULTIPLY;
        case OperationType.Play_Music:
            return InstructionType.MUSIC_PLAY;
        case OperationType.Play_Sound:
            return InstructionType.SOUND_PLAY;
        case OperationType.Store:
            return InstructionType.STORE;
        case OperationType.Subtract:
            return InstructionType.SUBTRACT;
        case OperationType.Clear:
            return InstructionType.DRAW_CLEAR;
        case OperationType.Bitwise_Not:
            return InstructionType.BITWISE_NOT;
        case OperationType.Wait:
            return InstructionType.WAIT_FRAME;
        case OperationType.Stop_Music:
            return InstructionType.MUSIC_STOP;
        case OperationType.No_Operation:
            return InstructionType.NOP;
        case OperationType.Get_Event:
            return InstructionType.GET_EVENT;
        case OperationType.Get_Mouse_Position:
            return InstructionType.GET_MOUSE_POSITION;
        case OperationType.Exit:
            return InstructionType.EXIT;
    }
}

export function get_number_arguments(operation: OperationType): number
{
    switch (operation)
    {
        // Two argument functions:
        case OperationType.Add:
        case OperationType.Bitwise_And:
        case OperationType.Bitwise_Or:
        case OperationType.Bitwise_Xor:
        case OperationType.Copy:
        case OperationType.Divide:
        case OperationType.Draw:
        case OperationType.Fill:
        case OperationType.Is_Equal:
        case OperationType.Is_Greater_Than:
        case OperationType.Is_Greater_Than_Or_Equal:
        case OperationType.Is_Less_Than:
        case OperationType.Is_Less_Than_Or_Equal:
        case OperationType.Is_Not_Equal:
        case OperationType.Jump:
        case OperationType.Modulo:
        case OperationType.Multiply:
        case OperationType.Play_Music:
        case OperationType.Play_Sound:
        case OperationType.Store:
        case OperationType.Subtract:
            return 2;
        // Single argument functions:
        case OperationType.Clear:
        case OperationType.Bitwise_Not:
            return 1;
        // Zero argument functions:
        case OperationType.Wait:
        case OperationType.Stop_Music:
        case OperationType.No_Operation:
        case OperationType.Get_Event:
        case OperationType.Get_Mouse_Position:
        case OperationType.Exit:
            return 0;
    }
}

export class ProcessOperationResult
{
    success: boolean;
    instruction: Instruction | null;
    error: SemanticError | null;

    constructor(result: Instruction | SemanticError)
    {
        if (result instanceof SemanticError)
        {
            this.success = false;
            this.instruction = null;
            this.error = result;
        }
        else
        {
            this.success = true;
            this.instruction = result;
            this.error = null;
        }
    }
}

/**
 * Parse the arguments for an operation
 * @param operation The operation we are parsing arguments for
 * @param args The remaining tokens on the line that make up the arguments
 * @param parser_context the current parser context
 */
export function process_operation(operation: OperationType, args: Token[], parser_context: ParserContext): ProcessOperationResult
{
    var number_arguments = get_number_arguments(operation);
    var current_tokens = args;
    var arg_values: ConstantValue[] = [];

    // Gather the arguments in any form you like
    for (var argument_number = 0; argument_number < number_arguments; argument_number++)
    {
        var next_arg_value = evaluate_value(current_tokens, parser_context);
        current_tokens = current_tokens.slice(next_arg_value.tokens.length);
        arg_values.push(next_arg_value);
    }
    
    // Did we get the right number of arguments?
    if (arg_values.length != number_arguments)
    {
        return new ProcessOperationResult(new SemanticError(parser_context.line, "Too few arguments to operation"));
    }

    // Are there too many arguments?
    if (current_tokens.length != 0)
    {
        return new ProcessOperationResult(new SemanticError(parser_context.line, "Too many arguments to operation"));
    }

    // Are the arguments all of the right form?
    arg_values.forEach(value => {
        if (value.type != ConstantValueType.Number && value.type != ConstantValueType.Label)
        {
            return new ProcessOperationResult(new SemanticError(parser_context.line, "Wrong argument type"));
        }
    });

    if (arg_values.length > 2)
    {
        return new ProcessOperationResult(new SemanticError(parser_context.line, "Logic error: No operation should have more than 2 arguments"));
    }

    // Finally put the operation together
    
    var arg1: bigint | Label = 0n;
    if (argument_number > 0)
    {
        if (arg_values[0].type == ConstantValueType.Label)
        {
            arg1 = new Label(arg_values[0].text, parser_context.line, parser_context.active_file);
        }
        else
        {
            arg1 = arg_values[0].value;
        }
    }
    var arg2: bigint | Label = 0n;
    if (argument_number > 1)
    {
        if (arg_values[1].type == ConstantValueType.Label)
        {
            arg2 = new Label(arg_values[1].text, parser_context.line, parser_context.active_file);
        }
        else
        {
            arg2 = arg_values[1].value;
        }
    }
    var instruction = new Instruction(operation, arg1, arg2);
    return new ProcessOperationResult(instruction);
}

export function process_tokens(tokens: Token[][], parser_context: ParserContext, process_file_result: ProcessFileResult)
{
    // Now we need to process each line...
    for (var line_number = 0; line_number < tokens.length; line_number += 1)
    {
        var line_tokens = tokens[line_number];

        // If we are in the definition of a macro, just copy the tokens into the definition unless we reached the end
        if (!!parser_context.active_macro)
        {
            if (line_tokens[0] instanceof MacroEnd_Token)
            {
                // Finished!
                parser_context.active_macro = null;
            }
            else
            {
                parser_context.macros.get(parser_context.active_macro).tokens.push(line_tokens);
            }
            continue;
        }
        
        // If we are in a macro, the line hasn't really changed
        if (parser_context.macro_stack.length == 0)
        {
            parser_context.line = line_number;
        }

        if (line_tokens.length == 0)
        {
            continue;
        }

        if (line_tokens[0] instanceof Label_Token)
        {
            process_file_result.instructions.push(new Label(line_tokens[0].name, parser_context.line, parser_context.active_file));
        }
        else if (line_tokens[0] instanceof Operation_Token)
        {
            var processed_operation = process_operation(line_tokens[0].operation, line_tokens.slice(1), parser_context);
            if (!processed_operation.success)
            {
                process_file_result.errors.get(parser_context.active_file).add(processed_operation.error);
            }
            else
            {
                process_file_result.instructions.push(processed_operation.instruction);
            }
        }
        else if (line_tokens[0] instanceof Define_Token)
        {
            // Cannot declare a define within a macro
            if (parser_context.macro_stack.length != 0)
            {
                process_file_result.errors.get(parser_context.active_file).add(new SemanticError(parser_context.line, "Cannot declare a define within a macro"));
            }
            else
            {
                var define_value = evaluate_value(line_tokens.slice(1), parser_context);
                if (define_value.type == ConstantValueType.Error)
                {
                    process_file_result.errors.get(parser_context.active_file).add(define_value.error);
                }
                else
                {
                    // Update the parser context with this define
                    parser_context.defines.set(line_tokens[0].name, define_value);
                }
            }
        }
        else if (line_tokens[0] instanceof MacroInvoked_Token)
        {
            var macro_name = line_tokens[0].name;
            // We need to paste the macro in, applying its arguments...
            var macro_args = evaluate_arguments(line_tokens.slice(1), parser_context);
            var found_error = false;
            macro_args.forEach(macro_arg => {
                if (macro_arg.type == ConstantValueType.Error)
                {
                    found_error = true;
                    process_file_result.errors.get(parser_context.active_file).add(macro_arg.error);
                }
            })
            if (!found_error)
            {
                if (!parser_context.macros.has(macro_name))
                {
                    process_file_result.errors.get(parser_context.active_file).add(new SemanticError(parser_context.line, "Macro not found"));
                }
                else if (parser_context.macros.get(macro_name).arguments.length != macro_args.length)
                {
                    process_file_result.errors.get(parser_context.active_file).add(new SemanticError(parser_context.line, "Wrong number of arguments passed to macro"));
                }
                else if (!!parser_context.macro_stack.find(macro => macro == macro_name))
                {
                    process_file_result.errors.get(parser_context.active_file).add(new SemanticError(parser_context.line, "Macro cycle detected"));
                }
                else
                {
                    // Evaluate the macro... update the parser context with the macro arguments...
                    // Since macros cannot themselves contain define statements, we can save off the defines and restore them after the macro
                    var old_defines = new Map<string, ConstantValue>(parser_context.defines);                    
                    parser_context.macro_stack.push(macro_name);
                    var macro_definition: MacroDefinition = parser_context.macros.get(line_tokens[0].name);
                    for (var macro_arg_index = 0; macro_arg_index < macro_args.length; macro_arg_index++)
                    {
                        parser_context.defines.set(macro_definition.arguments[macro_arg_index].name, macro_args[macro_arg_index]);
                    }
                    
                    // Now we recursively invoke ourselves to evaluate the macro tokens
                    process_tokens(macro_definition.tokens, parser_context, process_file_result);

                    // Restore the parser context
                    parser_context.macro_stack.pop();
                    parser_context.defines = old_defines;
                }
            }
        }
        else if (line_tokens[0] instanceof MacroBegin_Token)
        {
            // Cannot begin a macro within a macro
            if (parser_context.macro_stack.length != 0)
            {
                process_file_result.errors.get(parser_context.active_file).add(new SemanticError(parser_context.line, "Cannot begin a macro within a macro"));
            }
            else
            {
                // We need to identify the macro arguments, which should be a sequence of defines
                if (line_tokens.length < 2 || !(line_tokens[1] instanceof OpenBracket_Token)) {
                    process_file_result.errors.get(parser_context.active_file).add(new SemanticError(parser_context.line, "Open bracket for macro definition not found"));
                    continue;
                }
                if (line_tokens.length == 3 && line_tokens[2] instanceof CloseBracket_Token)
                {
                    // No arguments - add this to the parser context
                    parser_context.macros.set(line_tokens[0].name, new MacroDefinition([], []))
                    parser_context.active_macro = line_tokens[0].name;
                }
                else
                {
                    var current_token = 2;
                    var define_arguments: DefineInvoked_Token[] = []
                    while(true)
                    {
                        if (line_tokens.length <= current_token)
                        {
                            process_file_result.errors.get(parser_context.active_file).add(new SemanticError(parser_context.line, "End of macro definition not found"));
                            break;
                        }
                        var argument_token = line_tokens[current_token];
                        if (argument_token instanceof DefineInvoked_Token)
                        {
                            define_arguments.push(argument_token);
                        }
                        else
                        {
                            process_file_result.errors.get(parser_context.active_file).add(new SemanticError(parser_context.line, "Invalid argument name in macro definition"));
                            break;
                        }
                        current_token += 1;
                        // An argument should be followed either by a closing bracket or a comma.
                        if (line_tokens[current_token] instanceof CloseBracket_Token)
                        {
                            // The end. Add the macro definition with its arguments to the context
                            parser_context.macros.set(line_tokens[0].name, new MacroDefinition(define_arguments, []))
                            parser_context.active_macro = line_tokens[0].name;
                            break;
                        }
                        if (line_tokens[current_token] instanceof Comma_Token)
                        {
                            current_token += 1;
                        }
                    }
                    if (!parser_context.active_macro)
                    {
                        // Failed to find the end of the arguments list
                        process_file_result.errors.get(parser_context.active_file).add(new SemanticError(parser_context.line, "Failed to find end of macro definition"));
                    }
                }
            }
        }
        else if (line_tokens[0] instanceof MacroEnd_Token)
        {
            // Should not have found this as we are not in a macro definition. Error
            process_file_result.errors.get(parser_context.active_file).add(new SemanticError(parser_context.line, "Macro end found without definition"));
        }
        else if (line_tokens[0] instanceof Include_Token)
        {
            // The big one. Include another file...
            if (parser_context.macro_stack.length != 0)
            {
                process_file_result.errors.get(parser_context.active_file).add(new SemanticError(parser_context.line, "Cannot include within a macro"));
            }
            else if (line_tokens.length != 2 || !(line_tokens[1] instanceof StringLiteral_Token))
            {
                process_file_result.errors.get(parser_context.active_file).add(new SemanticError(parser_context.line, "Include excess symbols or missing include path"));
            }
            else
            {
                // We need to process the file independently, then merge the result...
                var full_path = path.join(parser_context.working_directory, line_tokens[1].text);
                process_file_result.errors.set(full_path, new Set<SemanticError>());

                // process file will update the include stack after checking for a cycle for us
                var include_file_result = process_file(full_path, parser_context);

                // Now combine the results...
                if (!include_file_result.success)
                {
                    process_file_result.errors.get(parser_context.active_file).add(new SemanticError(parser_context.line, "Included file contains an error"));
                }

                [...include_file_result.errors.keys()].forEach(file => {
                    if (!process_file_result.errors.has(file))
                    {
                        process_file_result.errors.set(file, new Set<SemanticError>());
                    }
                    include_file_result.errors.get(file).forEach(error => {
                        process_file_result.errors.get(file).add(error)
                    });
                })

                // And the operations themselves
                include_file_result.instructions.forEach(instruction => {
                    process_file_result.instructions.push(instruction);
                });
            }
        }
        else
        {
            process_file_result.errors.get(parser_context.active_file).add(new SemanticError(parser_context.line, "Invalid token found on start of line."));
        }
    }
}

export function print_process_file_result(program_header: ProgramHeader, result: ProcessFileResult)
{
    if (result.success)
    {
        console.log("Program compiled successfully! :)")
        console.log("")
        var current_code_address = program_header.code_address;
        result.instructions.forEach(entry => {
            if (entry instanceof Label_Token)
            {
                console.log("0x" + current_code_address.toString(16).padEnd(10) + entry.name);
            }
            else
            {
                var number_args = get_number_arguments(entry.type);
                if (number_args == 0)
                {
                    console.log("0x" + current_code_address.toString(16).padEnd(10) + entry.type.padEnd(8));
                }
                else if (number_args == 1)
                {
                    var arg1_string = "0x" + entry.arg1.toString(16);
                    if (entry.arg1 instanceof Label_Token)
                    {
                        arg1_string = entry.arg1.name;
                    }
                    console.log("0x" + current_code_address.toString(16).padEnd(10) + entry.type.padEnd(8) + " " + arg1_string.padEnd(18))
                }
                else
                {
                    var arg1_string = "0x" + entry.arg1.toString(16);
                    if (entry.arg1 instanceof Label_Token)
                    {
                        arg1_string = entry.arg1.name;
                    }
                    var arg2_string = "0x" + entry.arg2.toString(16);
                    if (entry.arg2 instanceof Label_Token)
                    {
                        arg2_string = entry.arg2.name;
                    }
                    console.log("0x" + current_code_address.toString(16).padEnd(10) + entry.type.padEnd(8) + " " + arg1_string.padEnd(18) + " " + arg2_string.padEnd(18))
                }
                current_code_address += 2;
            }
        });
    }
    else
    {
        console.log("Program failed to compile");
        [...result.errors.keys()].forEach(file => {
            var all_errors = [...result.errors.get(file).values()]
            all_errors.sort((a, b) => a.line < b.line ? -1 : 1);
            all_errors.forEach(error => {
                console.log(`File: ${file}. Line ${error.line + 1}: ${error.message}`);
            });
        });
    }
}

export function process_file(file_path: string, parser_context: ParserContext): ProcessFileResult
{
    var process_file_result = new ProcessFileResult();
    process_file_result.errors.set(file_path, new Set<SemanticError>());

    // Update the include context. If we have hit a cycle, give up
    if (!!parser_context.include_stack.find(value => value == file_path))
    {
        process_file_result.errors.get(file_path).add(new SemanticError(parser_context.line, "Cyclic include detected."));
        return process_file_result;
    }

    var old_file = parser_context.active_file;
    var old_line = parser_context.line;

    parser_context.include_stack.push(file_path)
    parser_context.active_file = file_path;
    parser_context.line = 0;

    // First, tokenise the file
    var lines = get_file_lines(file_path);
    var token_result = tokenise_file(lines);
    token_result = strip_comments(token_result);
    var semantic_errors = validate_basic_token_structure(token_result);

    // If basic validation failed, do not attempt compilation
    if (semantic_errors.length > 0)
    {
        semantic_errors.forEach(error => process_file_result.errors.get(parser_context.active_file).add(error));

        parser_context.active_file = old_file;
        parser_context.line = old_line;
        parser_context.include_stack.pop();

        return process_file_result;
    }

    process_tokens(token_result.tokens, parser_context, process_file_result);
    
    parser_context.active_file = old_file;
    parser_context.line = old_line;
    parser_context.include_stack.pop();

    var success = true;
    [...process_file_result.errors.values()].forEach(errors => {
        if (errors.size > 0)
        {
            success = false;
        }
    });
    process_file_result.success = success;

    return process_file_result;
}

export function get_label_name_without_direction(name: string)
{
    if (name.endsWith("f") || name.endsWith("b"))
    {
        return name.slice(0, name.length - 1);
    }
    return name;
}

/**
 * Find the address that corresponds to a label
 * @param label the label we are looking for
 * @param instruction_address the address of the instruction that needs a label resolved
 * @param label_addresses the possible label addresses. This is a keyed map of addresses in ascending order
 * @returns either a error if the label cannot be resolved, or the address (value) found
 */
export function find_label(label: Label, instruction_address: number, label_addresses: Map<string, number[]>): SemanticError | bigint
{
    var label_key = get_label_name_without_direction(label.name);
    if (!label_addresses.has(label_key))
    {
        return new SemanticError(label.line, "Label not found");
    }

    var possible_addresses = label_addresses.get(label_key);

    // If we should search backward...
    if (label.name.endsWith("b") || label.name.endsWith(":"))
    {
        var current_instance = 0;
        while(current_instance + 1 < possible_addresses.length)
        {
            if (possible_addresses[current_instance + 1] > instruction_address)
            {
                break;
            }
            current_instance += 1;
        }
        if (possible_addresses[current_instance] > instruction_address)
        {
            // All the labels appeared after the backwards search...
            if (label.name.endsWith("b"))
            {
                return new SemanticError(label.line, "Label not found when searching backwards");
            }
        }
        else
        {
            // Success!
            return BigInt(possible_addresses[current_instance]);
        }
    }
    else
    {
        // Search forward...
        var current_instance = 0;
        while(current_instance < possible_addresses.length)
        {
            if (possible_addresses[current_instance] > instruction_address)
            {
                break;
            }
            current_instance += 1;
        }
        if (possible_addresses[current_instance] > instruction_address)
        {
            // Success!
            return BigInt(possible_addresses[current_instance]);
        }
        else
        {
            // All the labels appeared before the forwards search...
            return new SemanticError(label.line, "Label not found when searching forwards");
        }
    }
}

/**
 * Resolve all the labels in the processed file to their code addresses
 * @param process_file_result the previously processed file. All macros etc must have been resolved already
 */
export function resolve_labels(program_header: ProgramHeader, process_file_result: ProcessFileResult)
{
    var label_addresses: Map<string, number[]> = new Map<string, number[]>();
    var current_code_address = program_header.code_address;

    // Firstly, note down where all the labels are
    process_file_result.instructions.forEach(instruction => {
        if (instruction instanceof Label)
        {
            var label_key = get_label_name_without_direction(instruction.name);
            if (!label_addresses.has(label_key))
            {
                label_addresses.set(label_key, []);
            }
            label_addresses.get(label_key).push(current_code_address);
        }
        else
        {
            current_code_address += 2
        }
    });
    
    // Now go through and locate the right labels...
    current_code_address = program_header.code_address;
    for (var instruction_index = 0; instruction_index < process_file_result.instructions.length; instruction_index++)
    {
        var instruction = process_file_result.instructions[instruction_index];
        if (instruction instanceof Label)
        {
            continue;
        }
        else
        {
            if (instruction.arg1 instanceof Label)
            {
                var new_arg1 = find_label(instruction.arg1, current_code_address, label_addresses);
                if (new_arg1 instanceof SemanticError)
                {
                    if (!process_file_result.errors.has(instruction.arg1.file))
                    {
                        process_file_result.errors.set(instruction.arg1.file, new Set<SemanticError>());
                    }
                    process_file_result.errors.get(instruction.arg1.file).add(new_arg1);
                }
                else
                {
                    instruction.arg1 = new_arg1;
                }
            }
            if (instruction.arg2 instanceof Label)
            {
                var new_arg2 = find_label(instruction.arg2, current_code_address, label_addresses);
                if (new_arg2 instanceof SemanticError)
                {
                    if (!process_file_result.errors.has(instruction.arg2.file))
                    {
                        process_file_result.errors.set(instruction.arg2.file, new Set<SemanticError>());
                    }
                    process_file_result.errors.get(instruction.arg2.file).add(new_arg2);
                }
                else
                {
                    instruction.arg2 = new_arg2;
                }
            }
            current_code_address += 2;
        }
    }

    // Finally strip out the labels themselves...
    process_file_result.instructions = process_file_result.instructions.filter(instruction => !(instruction instanceof Label))
}