import * as fs from 'fs';

export interface ProgramHeader {
    fps: number;
    screen_width: number;
    screen_height: number;
    memory: number;
    code_address: number;
    music: string[];
    sounds: string[];
    sprites: string[];
}

export function parse_program_header(path: string): ProgramHeader
{
    const configuration_json: string = fs.readFileSync(path, "utf-8");
    const program_header: ProgramHeader = JSON.parse(configuration_json);
    return program_header;
}
