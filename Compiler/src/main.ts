import { exit } from 'process';
import { compile } from './compiler';
import { print_process_file_result } from './semantics';

var command_line_arguments: string[] = process.argv.slice(1);

if (command_line_arguments.length < 2)
{
    console.log(`Usage: ${command_line_arguments[0]} <file path>`);
    exit(1);
}

var result = compile(command_line_arguments[1]);

print_process_file_result(result.program_header, result.process_file_result);
