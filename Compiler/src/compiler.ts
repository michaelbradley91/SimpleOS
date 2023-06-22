import path from "path";
import { ProgramHeader, parse_program_header } from "./configuration";
import { ParserContext, ProcessFileResult, process_file, resolve_labels } from "./semantics";

export class CompilationResult
{
    program_header: ProgramHeader
    process_file_result: ProcessFileResult

    constructor(program_header: ProgramHeader, process_file_result: ProcessFileResult)
    {
        this.program_header = program_header;
        this.process_file_result = process_file_result;
    }
}

export function compile(file_path: string): CompilationResult
{     
    var program_path: string = path.resolve(file_path);
    var configuration_path = program_path + ".json";

    var program_header: ProgramHeader = parse_program_header(configuration_path);
    var working_directory = path.dirname(program_path)

    // Construct a parser context...
    var parser_context = new ParserContext();
    parser_context.active_file = program_path;
    parser_context.working_directory = working_directory;
    parser_context.active_macro = null;

    // Add the sprites, sounds and music
    for (var music_index = 0; music_index < program_header.music.length; music_index++)
    {
        parser_context.music.set(program_header.music[music_index], music_index);
    }
    for (var sound_index = 0; sound_index < program_header.sounds.length; sound_index++)
    {
        parser_context.sounds.set(program_header.sounds[sound_index], sound_index);
    }
    for (var sprite_index = 0; sprite_index < program_header.sprites.length; sprite_index++)
    {
        parser_context.sprites.set(program_header.sprites[sprite_index], sprite_index);
    }

    var processed_file = process_file(program_path, parser_context);
    resolve_labels(program_header, processed_file);
    return new CompilationResult(program_header, processed_file);
}