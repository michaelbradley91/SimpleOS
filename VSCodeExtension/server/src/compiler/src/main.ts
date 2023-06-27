import { exit } from 'process';
import { compile, output_binary } from './compiler';
import { print_process_file_result } from './semantics';
import path = require('node:path');
import { set_get_file_lines, get_file_lines_from_filesystem } from './syntax';
import { parse_program_header } from './configuration';

// Use the filesystem for path resolution
set_get_file_lines(get_file_lines_from_filesystem);

const command_line_arguments: string[] = process.argv.slice(1);
if (command_line_arguments.length < 2)
{
    console.log(`Usage: ${command_line_arguments[0]} <configuration>`);
    exit(1);
}

const configuration_path = command_line_arguments[1];
const program_header = parse_program_header(configuration_path);
const result = compile(program_header);

print_process_file_result(result.program_header, result.process_file_result, console.log);

if (result.process_file_result.success)
{
    const out_file_path = result.program_header.output_file;
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

