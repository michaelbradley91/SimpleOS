import { writeFileSync } from "fs";
import { fileSync } from "tmp";
import { CloseBracket_Token, Comma_Token, Constant_Token, ConstantInvoked_Token, Include_Token, Label_Token, TemplateBegin_Token, TemplateEnd_Token, MultiLineComment_Token, NumberLiteral_Token, OpenBracket_Token, Operation_Token, OperationType, SingleLineComment_Token, StringLiteral_Token, TokenLineResult, tokenise_line, get_file_lines, tokenise_file, TokenFileResult, set_get_file_lines, get_file_lines_from_filesystem } from "../src/syntax";
import * as assert from 'assert';
import { fileURLToPath } from 'url';

describe("tokenise_line", () =>
{
    it("Add command can be tokenised correctly", () => {
        assert.deepEqual(tokenise_line("add 3 4", null),
            new TokenLineResult(
            [
                new Operation_Token(OperationType.Add, 0, 3),
                new NumberLiteral_Token(3n),
                new NumberLiteral_Token(4n)
            ], null)
        );
    });

    it("Include can be tokenised correctly", () => {
        assert.deepEqual(tokenise_line("#include \"./my_stuff.sos\"", null),
            new TokenLineResult(
                [
                    new Include_Token(),
                    new StringLiteral_Token("./my_stuff.sos", 9, 25)
                ],
                null
            )
        );
    });

    it("Constant can be tokenised correctly", () => {
        assert.deepEqual(tokenise_line("#constant X 0x400", null),
            new TokenLineResult(
                [
                    new Constant_Token("X"),
                    new NumberLiteral_Token(0x400n)
                ],
                null
            )
        );
        assert.deepEqual(tokenise_line("#constant HELLO \"bob\"", null),
            new TokenLineResult(
                [
                    new Constant_Token("HELLO"),
                    new StringLiteral_Token("bob", 16, 21)
                ],
                null
            )
        );
    });

    it("Template begin can be tokenised correctly", () => {
        assert.deepEqual(tokenise_line("#template_begin FUNC()", null),
            new TokenLineResult(
                [
                    new TemplateBegin_Token("FUNC"),
                    new OpenBracket_Token(),
                    new CloseBracket_Token()
                ],
                null
            )
        );
        assert.deepEqual(tokenise_line("#template_begin FUNC(X, STUFF)", null),
            new TokenLineResult(
                [
                    new TemplateBegin_Token("FUNC"),
                    new OpenBracket_Token(),
                    new ConstantInvoked_Token("X"),
                    new Comma_Token(),
                    new ConstantInvoked_Token("STUFF"),
                    new CloseBracket_Token()
                ],
                null
            )
        );
    });

    it("Label can be tokenised correctly", () => {
        assert.deepEqual(tokenise_line("bob:", null),
            new TokenLineResult(
                [
                    new Label_Token("bob:")
                ],
                null
            )
        );

        assert.deepEqual(tokenise_line("jmp bob:", null),
            new TokenLineResult(
                [
                    new Operation_Token(OperationType.Jump, 0, 3),
                    new Label_Token("bob:")
                ],
                null
            )
        );
    });

    it("Template end can be tokenised correctly", () => {
        assert.deepEqual(tokenise_line("#template_end", null),
            new TokenLineResult(
                [
                    new TemplateEnd_Token()
                ],
                null
            )
        );
    });

    it("Single line comment can be tokenised correctly", () => {
        assert.deepEqual(tokenise_line("// howdy \"stranger\", woo", null),
            new TokenLineResult(
                [
                    new SingleLineComment_Token(" howdy \"stranger\", woo")
                ],
                null
            )
        );
        assert.deepEqual(tokenise_line("xor 400 500 // howdy \"stranger\", woo", null),
            new TokenLineResult(
                [
                    new Operation_Token(OperationType.Bitwise_Xor, 0, 3),
                    new NumberLiteral_Token(400n),
                    new NumberLiteral_Token(500n),
                    new SingleLineComment_Token(" howdy \"stranger\", woo")
                ],
                null
            )
        );
    });

    it("Multi line comment can be tokenised correctly", () => {
        assert.deepEqual(tokenise_line("sub 3 /*howdy*/ 4", null),
            new TokenLineResult(
                [
                    new Operation_Token(OperationType.Subtract, 0, 3),
                    new NumberLiteral_Token(3n),
                    new MultiLineComment_Token("howdy"),
                    new NumberLiteral_Token(4n)
                ],
                null
            )
        );
        assert.deepEqual(tokenise_line("/*what is up dude?*/", null),
            new TokenLineResult(
                [
                    new MultiLineComment_Token("what is up dude?")
                ],
                null
            )
        );
        assert.deepEqual(tokenise_line("div 40 8 /*what is up dude?*/", null),
            new TokenLineResult(
                [
                    new Operation_Token(OperationType.Divide, 0, 3),
                    new NumberLiteral_Token(40n),
                    new NumberLiteral_Token(8n),
                    new MultiLineComment_Token("what is up dude?")
                ],
                null
            )
        );
        assert.deepEqual(tokenise_line("div 40 8 /*what is up dude?", null),
            new TokenLineResult(
                [
                    new Operation_Token(OperationType.Divide, 0, 3),
                    new NumberLiteral_Token(40n),
                    new NumberLiteral_Token(8n),
                    new MultiLineComment_Token("what is up dude?\n")
                ],
                new MultiLineComment_Token("what is up dude?\n")
            )
        );
        let old_multi_line_comment = new MultiLineComment_Token("howdy. This is \n");
        assert.deepEqual(tokenise_line("long */ div 40 8 /*what is up dude?", 
        old_multi_line_comment),
            new TokenLineResult(
                [
                    new Operation_Token(OperationType.Divide, 8, 11),
                    new NumberLiteral_Token(40n),
                    new NumberLiteral_Token(8n),
                    new MultiLineComment_Token("what is up dude?\n")
                ],
                new MultiLineComment_Token("what is up dude?\n")
            )
        );
        assert.deepEqual(old_multi_line_comment.comment, "howdy. This is \nlong ");

        old_multi_line_comment = new MultiLineComment_Token("howdy. This is \n");
        assert.deepEqual(tokenise_line("long. what is up dude?", 
        old_multi_line_comment),
            new TokenLineResult(
                [],
                old_multi_line_comment
            )
        );
        assert.deepEqual((old_multi_line_comment.comment), "howdy. This is \nlong. what is up dude?\n");
    });

    it("Blank line tokenised correctly", () => {
        assert.deepEqual((tokenise_line("", null)),
            new TokenLineResult([], null)
        );

        assert.deepEqual(tokenise_line("  ", null),
            new TokenLineResult([], null)
        );

        let old_multi_line_comment = new MultiLineComment_Token("howdy. This is \n");
        assert.deepEqual(tokenise_line("", old_multi_line_comment),
            new TokenLineResult([], old_multi_line_comment)
        );

        assert.deepEqual(old_multi_line_comment.comment, "howdy. This is \n\n");

        old_multi_line_comment = new MultiLineComment_Token("howdy. This is \n");
        assert.deepEqual(tokenise_line(" ", old_multi_line_comment),
            new TokenLineResult([], old_multi_line_comment)
        );

        assert.deepEqual(old_multi_line_comment.comment, "howdy. This is \n \n");
    });

    it("Can get file lines", () => {
        const tmp_file = fileSync();
        writeFileSync(tmp_file.name, "add 3 4\n// what is this\nstuff");
        set_get_file_lines(get_file_lines_from_filesystem);
        assert.deepEqual(get_file_lines(tmp_file.name),
            ["add 3 4", "// what is this", "stuff"]
        );
    });

    it("Can tokenise a whole file", () => {
        assert.deepEqual(tokenise_file([
            "add 3 4 // hello",
            "/* bob",
            "",
            "*/",
            "#include \"my_stuff.sos\"",
        ]),
            new TokenFileResult(
            [
                [
                    new Operation_Token(OperationType.Add, 0, 3),
                    new NumberLiteral_Token(3n),
                    new NumberLiteral_Token(4n),
                    new SingleLineComment_Token(" hello")
                ],
                [new MultiLineComment_Token(" bob\n\n")],
                [],
                [],
                [
                    new Include_Token(),
                    new StringLiteral_Token("my_stuff.sos", 9, 23)
                ]
            ])
        );
    });

    it("Bigints behave as expected", () => {
        assert.deepEqual(BigInt.asUintN(64, -1n), 0xFFFFFFFFFFFFFFFFn);
        assert.deepEqual(BigInt.asUintN(64, -2n), 0xFFFFFFFFFFFFFFFEn);
        assert.deepEqual(BigInt.asUintN(64, 0xFFFFFFFFFFFFFFFFn), 0xFFFFFFFFFFFFFFFFn);
    });

    it("Buffer behaves as expected", () => {
        const byte_array: Uint8Array = new Uint8Array(Buffer.from("hello", "utf-8"));
        assert.deepEqual(byte_array, new Uint8Array([0x68, 0x65, 0x6c, 0x6c, 0x6f]));
    });

    it("Decodes a file URI", () => {
        const url = new URL("file:///c%3A/Users/micha/repos/SimpleOS/Compiler/example/example.sos");
        const path = fileURLToPath(url);
        assert.deepEqual(path, "c:\\Users\\micha\\repos\\SimpleOS\\Compiler\\example\\example.sos");
    });
});