import path from "path";
import { ProgramHeader, parse_program_header } from "./configuration";
import { ParserContext, ProcessFileResult, SemanticError, process_file, resolve_labels } from "./semantics";
import { bigint_to_bytes16, bigint_to_bytes48, concat_bytes, file_to_bytes, right_pad_bytes, string_to_bytes } from "./byte_converters";

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

export class ProgramHeaderToBytesResult
{
    errors: SemanticError[] = [];
    bytes: number[] = new
}

/**
 * 
 * @param program_header
const HEADER_SIZE_BYTES = 48
const HEADER_MAGIC = 0xFEEDC0FFEE # Magic to identify the start of the program
class Header:
	var magic: int
	var view_width: int
	var view_height: int
	var fps: int
	var code_address: int
	var memory_size: int
	
	func _init(bytes: PackedByteArray, offset: int):
		magic = bytes.decode_s64(offset)
		view_width = bytes.decode_s64(offset + 8)
		view_height = bytes.decode_s64(offset + 16)
		fps = bytes.decode_s64(offset + 24)
		code_address = bytes.decode_s64(offset + 32)
		memory_size = bytes.decode_s64(offset + 40)
	
	func size():
		return HEADER_SIZE_BYTES
 * @returns 
 */

// Magic at the start of every executable file
export const PROGRAM_HEADER_MAGIC = 0xFEEDC0FFEEn;

/**
 * Convert the program header (excluding assets) to bytes
 * @param program_header the program header
 * @returns the bytes representing the program header
 */
export function program_header_to_bytes(program_header: ProgramHeader): Uint8Array
{
    var magic_bytes = bigint_to_bytes64(PROGRAM_HEADER_MAGIC);
    var view_width_bytes = bigint_to_bytes64(program_header.screen_width);
    var view_height_bytes = bigint_to_bytes64(program_header.screen_height);
    var fps_bytes = bigint_to_bytes64(program_header.fps);
    var code_address_bytes = bigint_to_bytes64(program_header.code_address);
    var memory_bytes = bigint_to_bytes64(program_header.memory);

    return concat_bytes([magic_bytes, view_width_bytes, view_height_bytes, fps_bytes, code_address_bytes, memory_bytes]);
}

/**
 * Asset types in the binary format
 * 
 * Assets are stored in the format:
 * <2 byte type> | <6 byte length> | <file name padded to 8 bytes with a null terminator> | <bytes... padded to 8 bytes>
 */
enum AssetTypes {
	NO_ASSET = 0,
	SPRITE_ASSET = 1,
	MUSIC_ASSET = 2,
	SOUND_ASSET = 3
}

/**
 * Convert the asset list in the program header into bytes. This will take a while since the assets
 * are stuffed into the binary as is...
 * @param program_header the program header detailing the assets
 */
export function assets_to_bytes(program_header: ProgramHeader): Uint8Array
{
    var asset_bytes = []
    program_header.music.forEach(music_entry => {
        var file_type_bytes = bigint_to_bytes16(AssetTypes.MUSIC_ASSET);
        var file_bytes = file_to_bytes(music_entry);
        var file_length_bytes = bigint_to_bytes48(file_bytes.length);
        file_bytes = right_pad_bytes(file_bytes, 8);
        var file_name_bytes = right_pad_bytes(string_to_bytes(music_entry), 8);

        asset_bytes.push(concat_bytes([file_type_bytes, file_length_bytes, file_name_bytes, file_bytes]));
    });

    program_header.sounds.forEach(sound_entry => {
        var file_type_bytes = bigint_to_bytes16(AssetTypes.SOUND_ASSET);
        var file_bytes = file_to_bytes(sound_entry);
        var file_length_bytes = bigint_to_bytes48(file_bytes.length);
        file_bytes = right_pad_bytes(file_bytes, 8);
        var file_name_bytes = right_pad_bytes(string_to_bytes(sound_entry), 8);

        asset_bytes.push(concat_bytes([file_type_bytes, file_length_bytes, file_name_bytes, file_bytes]));
    });

    program_header.sprites.forEach(sprite_entry => {
        var file_type_bytes = bigint_to_bytes16(AssetTypes.SPRITE_ASSET);
        var file_bytes = file_to_bytes(sprite_entry);
        var file_length_bytes = bigint_to_bytes48(file_bytes.length);
        file_bytes = right_pad_bytes(file_bytes, 8);
        var file_name_bytes = right_pad_bytes(string_to_bytes(sprite_entry), 8);

        asset_bytes.push(concat_bytes([file_type_bytes, file_length_bytes, file_name_bytes, file_bytes]));
    });

    return concat_bytes(asset_bytes);
}

/**
 * Output the compiled binary to an executable file
 * @param compilation_result the compiled program to export
 * @param out_file where to write the final binary
 */
export function output_binary(program_header: ProgramHeader, compilation_result: CompilationResult, out_file: string): boolean
{
    var x: bigint = 0n;
    x.
}