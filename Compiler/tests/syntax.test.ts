import { writeFileSync } from "fs";
import { fileSync } from "tmp";
import { CloseBracket_Token, Comma_Token, Define_Token, DefineInvoked_Token, Include_Token, Label_Token, MacroBegin_Token, MacroEnd_Token, MultiLineComment_Token, NumberLiteral_Token, OpenBracket_Token, Operation_Token, OperationType, SingleLineComment_Token, StringLiteral_Token, TokenLineResult, tokenise_line, get_file_lines, tokenise_file, TokenFileResult } from "../src/syntax";

test("Add command can be tokenised correctly", () => {
    expect(tokenise_line("add 3 4", null)).toEqual(
        new TokenLineResult(
        [
            new Operation_Token(OperationType.Add),
            new NumberLiteral_Token(3),
            new NumberLiteral_Token(4)
        ], null)
    )
});

test("Include can be tokenised correctly", () => {
    expect(tokenise_line("#include \"./my_stuff.sos\"", null)).toEqual(
        new TokenLineResult(
            [
                new Include_Token(),
                new StringLiteral_Token("./my_stuff.sos")
            ],
            null
        )
    )
});

test("Define can be tokenised correctly", () => {
    expect(tokenise_line("#define X 0x400", null)).toEqual(
        new TokenLineResult(
            [
                new Define_Token("X"),
                new NumberLiteral_Token(0x400)
            ],
            null
        )
    )
    expect(tokenise_line("#define HELLO \"bob\"", null)).toEqual(
        new TokenLineResult(
            [
                new Define_Token("HELLO"),
                new StringLiteral_Token("bob")
            ],
            null
        )
    )
})

test("Macro begin can be tokenised correctly", () => {
    expect(tokenise_line("#macro_begin FUNC()", null)).toEqual(
        new TokenLineResult(
            [
                new MacroBegin_Token("FUNC"),
                new OpenBracket_Token(),
                new CloseBracket_Token()
            ],
            null
        )
    )
    expect(tokenise_line("#macro_begin FUNC(X, STUFF)", null)).toEqual(
        new TokenLineResult(
            [
                new MacroBegin_Token("FUNC"),
                new OpenBracket_Token(),
                new DefineInvoked_Token("X"),
                new Comma_Token(),
                new DefineInvoked_Token("STUFF"),
                new CloseBracket_Token()
            ],
            null
        )
    )
})

test("Label can be tokenised correctly", () => {
    expect(tokenise_line("bob:", null)).toEqual(
        new TokenLineResult(
            [
                new Label_Token("bob:")
            ],
            null
        )
    )

    expect(tokenise_line("jmp bob:", null)).toEqual(
        new TokenLineResult(
            [
                new Operation_Token(OperationType.Jump),
                new Label_Token("bob:")
            ],
            null
        )
    )
})

test("Macro end can be tokenised correctly", () => {
    expect(tokenise_line("#macro_end", null)).toEqual(
        new TokenLineResult(
            [
                new MacroEnd_Token()
            ],
            null
        )
    )
})

test("Single line comment can be tokenised correctly", () => {
    expect(tokenise_line("// howdy \"stranger\", woo", null)).toEqual(
        new TokenLineResult(
            [
                new SingleLineComment_Token(" howdy \"stranger\", woo")
            ],
            null
        )
    )
    expect(tokenise_line("xor 400 500 // howdy \"stranger\", woo", null)).toEqual(
        new TokenLineResult(
            [
                new Operation_Token(OperationType.Bitwise_Xor),
                new NumberLiteral_Token(400),
                new NumberLiteral_Token(500),
                new SingleLineComment_Token(" howdy \"stranger\", woo")
            ],
            null
        )
    )
})

test("Multi line comment can be tokenised correctly", () => {
    expect(tokenise_line("sub 3 /*howdy*/ 4", null)).toEqual(
        new TokenLineResult(
            [
                new Operation_Token(OperationType.Subtract),
                new NumberLiteral_Token(3),
                new MultiLineComment_Token("howdy"),
                new NumberLiteral_Token(4)
            ],
            null
        )
    )
    expect(tokenise_line("/*what is up dude?*/", null)).toEqual(
        new TokenLineResult(
            [
                new MultiLineComment_Token("what is up dude?")
            ],
            null
        )
    )
    expect(tokenise_line("div 40 8 /*what is up dude?*/", null)).toEqual(
        new TokenLineResult(
            [
                new Operation_Token(OperationType.Divide),
                new NumberLiteral_Token(40),
                new NumberLiteral_Token(8),
                new MultiLineComment_Token("what is up dude?")
            ],
            null
        )
    )
    expect(tokenise_line("div 40 8 /*what is up dude?", null)).toEqual(
        new TokenLineResult(
            [
                new Operation_Token(OperationType.Divide),
                new NumberLiteral_Token(40),
                new NumberLiteral_Token(8),
                new MultiLineComment_Token("what is up dude?\n")
            ],
            new MultiLineComment_Token("what is up dude?\n")
        )
    )
    let old_multi_line_comment = new MultiLineComment_Token("howdy. This is \n")
    expect(tokenise_line("long */ div 40 8 /*what is up dude?", 
    old_multi_line_comment)).toEqual(
        new TokenLineResult(
            [
                new Operation_Token(OperationType.Divide),
                new NumberLiteral_Token(40),
                new NumberLiteral_Token(8),
                new MultiLineComment_Token("what is up dude?\n")
            ],
            new MultiLineComment_Token("what is up dude?\n")
        )
    )
    expect(old_multi_line_comment.comment).toEqual("howdy. This is \nlong ")

    old_multi_line_comment = new MultiLineComment_Token("howdy. This is \n")
    expect(tokenise_line("long. what is up dude?", 
    old_multi_line_comment)).toEqual(
        new TokenLineResult(
            [],
            old_multi_line_comment
        )
    )
    expect(old_multi_line_comment.comment).toEqual("howdy. This is \nlong. what is up dude?\n")
})

test("Blank line tokenised correctly", () => {
    expect(tokenise_line("", null)).toEqual(
        new TokenLineResult([], null)
    )

    expect(tokenise_line("  ", null)).toEqual(
        new TokenLineResult([], null)
    )

    let old_multi_line_comment = new MultiLineComment_Token("howdy. This is \n")
    expect(tokenise_line("", old_multi_line_comment)).toEqual(
        new TokenLineResult([], old_multi_line_comment)
    )

    expect(old_multi_line_comment.comment).toEqual("howdy. This is \n\n")

    old_multi_line_comment = new MultiLineComment_Token("howdy. This is \n")
    expect(tokenise_line(" ", old_multi_line_comment)).toEqual(
        new TokenLineResult([], old_multi_line_comment)
    )

    expect(old_multi_line_comment.comment).toEqual("howdy. This is \n \n")
})

test("Can get file lines", () => {
    const tmp_file = fileSync();
    writeFileSync(tmp_file.name, "add 3 4\n// what is this\nstuff");

    expect(get_file_lines(tmp_file.name)).toEqual(
        ["add 3 4", "// what is this", "stuff"]
    )
});

test("Can tokenise a whole file", () => {
    expect(tokenise_file([
        "add 3 4 // hello",
        "/* bob",
        "",
        "*/",
        "#include \"my_stuff.sos\"",
    ])).toEqual(
        new TokenFileResult(
        [
            [
                new Operation_Token(OperationType.Add),
                new NumberLiteral_Token(3),
                new NumberLiteral_Token(4),
                new SingleLineComment_Token(" hello")
            ],
            [new MultiLineComment_Token(" bob\n\n")],
            [],
            [],
            [
                new Include_Token(),
                new StringLiteral_Token("my_stuff.sos")
            ]
        ])
    );
});
