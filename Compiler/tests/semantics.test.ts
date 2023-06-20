import { identify_value } from "../src/semantics";
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
        new NumberLiteral_Token(3443),
        new Comma_Token()
    ])).toEqual([
        new NumberLiteral_Token(3443)
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
        new NumberLiteral_Token(300),
        new CloseBracket_Token(),
        new Comma_Token()
    ])).toEqual([
        new Function_Token(FunctionType.Colour),
        new OpenBracket_Token(),
        new NumberLiteral_Token(300),
        new CloseBracket_Token()
    ])

    expect(identify_value([
        new Function_Token(FunctionType.Colour),
        new OpenBracket_Token(),
        new NumberLiteral_Token(300),
        new Comma_Token(),
        new StringLiteral_Token("Hello"),
        new CloseBracket_Token(),
        new Comma_Token()
    ])).toEqual([
        new Function_Token(FunctionType.Colour),
        new OpenBracket_Token(),
        new NumberLiteral_Token(300),
        new Comma_Token(),
        new StringLiteral_Token("Hello"),
        new CloseBracket_Token()
    ])

    expect(identify_value([
        new Function_Token(FunctionType.Colour),
        new OpenBracket_Token(),
        new NumberLiteral_Token(300),
        new Comma_Token(),
        new StringLiteral_Token("Hello"),
        new Comma_Token(),
        new MacroInvoked_Token("FUNC"),
        new OpenBracket_Token(),
        new NumberLiteral_Token(400),
        new Comma_Token(),
        new DefineInvoked_Token("BOB"),
        new CloseBracket_Token(),
        new CloseBracket_Token(),
        new Comma_Token()
    ])).toEqual([
        new Function_Token(FunctionType.Colour),
        new OpenBracket_Token(),
        new NumberLiteral_Token(300),
        new Comma_Token(),
        new StringLiteral_Token("Hello"),
        new Comma_Token(),
        new MacroInvoked_Token("FUNC"),
        new OpenBracket_Token(),
        new NumberLiteral_Token(400),
        new Comma_Token(),
        new DefineInvoked_Token("BOB"),
        new CloseBracket_Token(),
        new CloseBracket_Token()
    ])
});