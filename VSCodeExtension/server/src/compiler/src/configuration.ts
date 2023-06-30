import * as fs from 'fs';
import path = require('node:path');

export interface ProgramHeader {
    fps: number;
    screen_width: number;
    screen_height: number;
    memory: number;
    code_address: number;
    music: string[];
    sounds: string[];
    sprites: string[];
    main: string;
    working_directory: string;
    output_file: string;
    pixel_perfect: boolean;
}

export function parse_program_header(configuration_path: string): ProgramHeader
{
    const configuration_json: string = fs.readFileSync(configuration_path, "utf-8");
    const program_header: ProgramHeader = JSON.parse(configuration_json);
    const config_path_parsed = path.parse(configuration_path);
    if (!program_header.working_directory)
    {
        // Use our own directory
        program_header.working_directory = config_path_parsed.dir;
    }
    const out_file_path = path.join(config_path_parsed.dir, path.parse(config_path_parsed.name).name + ".sox");
    if (!program_header.output_file)
    {
        program_header.output_file = out_file_path;
    }
    if (!program_header.main)
    {
        program_header.main = path.join(config_path_parsed.dir, config_path_parsed.name);
    }
    return program_header;
}
