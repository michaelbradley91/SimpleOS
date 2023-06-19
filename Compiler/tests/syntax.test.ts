import { tokenise_line } from "../src/syntax";

test("Something", () => {
    var tokenise_line_result = tokenise_line("add 3 4", null);
    console.log(tokenise_line_result);
});
