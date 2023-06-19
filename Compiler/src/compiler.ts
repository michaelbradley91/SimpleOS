import { exit } from 'process';
import { ProgramHeader, parse_program_header } from './configuration';

var command_line_arguments: string[] = process.argv.slice(1);

if (command_line_arguments.length < 2)
{
    console.log(`Usage: ${command_line_arguments[0]} <file path>`);
    exit(1);
}

var program_path: string = command_line_arguments[1];
var configuration_path = program_path + ".json";

var program_header: ProgramHeader = parse_program_header(configuration_path);
console.log(`Successfully parsed program header. Got FPS: ${program_header.fps}`);
