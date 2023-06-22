import { ConstantValue, ParserContext, evaluate_value, identify_value } from "../src/semantics";
import { CloseBracket_Token, Comma_Token, DefineInvoked_Token, FunctionType, Function_Token, Label_Token, MacroInvoked_Token, NumberLiteral_Token, OpenBracket_Token, StringLiteral_Token } from "../src/syntax";

test("identify_value can pull single values", () => {
    expect(identify_value([
        new DefineInvoked_Token("HELLO"),
        new Comma_Token()
    ])).toEqual([
        new DefineInvoked_Token("HELLO")
    ])

    expect(identify_value([
        new Label_Token("HELLO"),
        new Comma_Token()
    ])).toEqual([
        new Label_Token("HELLO")
    ])

    expect(identify_value([
        new NumberLiteral_Token(3443n),
        new Comma_Token()
    ])).toEqual([
        new NumberLiteral_Token(3443n)
    ])

    expect(identify_value([
        new StringLiteral_Token("hello"),
        new Comma_Token()
    ])).toEqual([
        new StringLiteral_Token("hello")
    ])
});

test("identify_value can extract function arguments", () => {
    expect(identify_value([
        new Function_Token(FunctionType.Colour),
        new OpenBracket_Token(),
        new NumberLiteral_Token(300n),
        new CloseBracket_Token(),
        new Comma_Token()
    ])).toEqual([
        new Function_Token(FunctionType.Colour),
        new OpenBracket_Token(),
        new NumberLiteral_Token(300n),
        new CloseBracket_Token()
    ])

    expect(identify_value([
        new Function_Token(FunctionType.Colour),
        new OpenBracket_Token(),
        new NumberLiteral_Token(300n),
        new Comma_Token(),
        new StringLiteral_Token("Hello"),
        new CloseBracket_Token(),
        new Comma_Token()
    ])).toEqual([
        new Function_Token(FunctionType.Colour),
        new OpenBracket_Token(),
        new NumberLiteral_Token(300n),
        new Comma_Token(),
        new StringLiteral_Token("Hello"),
        new CloseBracket_Token()
    ])

    expect(identify_value([
        new Function_Token(FunctionType.Colour),
        new OpenBracket_Token(),
        new NumberLiteral_Token(300n),
        new Comma_Token(),
        new StringLiteral_Token("Hello"),
        new Comma_Token(),
        new MacroInvoked_Token("FUNC"),
        new OpenBracket_Token(),
        new NumberLiteral_Token(400n),
        new Comma_Token(),
        new DefineInvoked_Token("BOB"),
        new CloseBracket_Token(),
        new CloseBracket_Token(),
        new Comma_Token()
    ])).toEqual([
        new Function_Token(FunctionType.Colour),
        new OpenBracket_Token(),
        new NumberLiteral_Token(300n),
        new Comma_Token(),
        new StringLiteral_Token("Hello"),
        new Comma_Token(),
        new MacroInvoked_Token("FUNC"),
        new OpenBracket_Token(),
        new NumberLiteral_Token(400n),
        new Comma_Token(),
        new DefineInvoked_Token("BOB"),
        new CloseBracket_Token(),
        new CloseBracket_Token()
    ])
});

test("evaluate_value can evaluate simple constants", () => {
    var parser_context = new ParserContext();
    expect(evaluate_value([new NumberLiteral_Token(400n)], parser_context))
    .toEqual(new ConstantValue([new NumberLiteral_Token(400n)], 400n));
    
    expect(evaluate_value([new StringLiteral_Token("Hello")], parser_context))
    .toEqual(new ConstantValue([new StringLiteral_Token("Hello")], "Hello")); 

    expect(evaluate_value([new Label_Token("bob:")], parser_context))
    .toEqual(new ConstantValue([new Label_Token("bob:")], "bob:"));

    expect(evaluate_value([new Label_Token("bob:")], parser_context))
    .toEqual(new ConstantValue([new Label_Token("bob:")], "bob:"));

    parser_context.defines.set("YELLOW", new ConstantValue([new NumberLiteral_Token(0xFFFF00FFn)], 0xFFFF00FFn))
    expect(evaluate_value([new DefineInvoked_Token("YELLOW")], parser_context))
        .toEqual(new ConstantValue([new DefineInvoked_Token("YELLOW")], 0xFFFF00FFn)); 
});

test("evaluate_value can evaluate functions", () => {
    var parser_context = new ParserContext();
    var function_tokens = [
        new Function_Token(FunctionType.Colour),
        new OpenBracket_Token(),
        new NumberLiteral_Token(255n),
        new Comma_Token(),
        new NumberLiteral_Token(255n),
        new Comma_Token(),
        new NumberLiteral_Token(0n),
        new Comma_Token(),
        new NumberLiteral_Token(255n),
        new CloseBracket_Token()];
    expect(evaluate_value(function_tokens, parser_context))
    .toEqual(new ConstantValue(function_tokens, 0xFFFF00FFn));
});
