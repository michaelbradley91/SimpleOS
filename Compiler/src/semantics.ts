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
 */
export function validate(result: TokenFileResult): SemanticError[]
{
    var errors: SemanticError[] = [];
    var macro_context: MacroContext | null = null;
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
        if (!!macro_context) {
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
            macro_context = null;
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