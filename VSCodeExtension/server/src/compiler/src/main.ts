import { exit } from 'process';
import { compile, output_binary } from './compiler';
import { print_process_file_result } from './semantics';
import path = require('node:path');

const command_line_arguments: string[] = process.argv.slice(1);

if (command_line_arguments.length < 2)
{
    console.log(`Usage: ${command_line_arguments[0]} <file path>`);
    exit(1);
}

const file_path = command_line_arguments[1];
const result = compile(file_path);

print_process_file_result(result.program_header, result.process_file_result);

if (result.process_file_result.success)
{
    const file_path_parsed = path.parse(file_path);
    const out_file_path = path.join(file_path_parsed.dir, file_path_parsed.name + ".sosexe");
    const output_result = output_binary(result, out_file_path);
    if (output_result)
    {
        console.log("Saved executable to: " + out_file_path);
    }
    else
    {
        console.log("Failed to save executable.");
    }
}

