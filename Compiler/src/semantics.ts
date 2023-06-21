/**
 * This file handles the semantic interpretation of the language
 * This uses the tokenised form of the file to interpret it
 */

import { start } from "repl";
import { CloseBracket_Token, Comma_Token, DefineInvoked_Token, Define_Token, FunctionType, Function_Token, Include_Token, Label_Token, MacroBegin_Token, MacroEnd_Token, MacroInvoked_Token, MultiLineComment_Token, NumberLiteral_Token, OpenBracket_Token, Operation_Token, SingleLineComment_Token, StringLiteral_Token, Token, TokenFileResult } from "./syntax";

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
class SemanticError
{
    line: number
    message: string

    constructor(line: number, message: string)
    {
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
            if (value_tokens)
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
 * Information about the parser as it processes the file
 */
export class ParserContext
{
    defines: Map<string, ConstantValue> = new Map<string, ConstantValue>();
    macros: Map<string, Token[]> = new Map<string, Token[]>();
    music: Map<string, number> = new Map<string, number>();
    sounds: Map<string, number> = new Map<string, number>();
    sprites: Map<string, number> = new Map<string, number>();
    line: number = 0;

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
            if (data.endsWith(":"))
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
