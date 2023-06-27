import { ProgramHeader, parse_program_header } from "./configuration";
import { Instruction, ParserContext, ProcessFileResult, SemanticError, process_file, resolve_labels } from "./semantics";
import { bigint_to_bytes16, bigint_to_bytes48, bigint_to_bytes64, concat_bytes, file_to_bytes, right_pad_bytes, string_to_bytes } from "./byte_converters";
import { Label, OperationType } from "./syntax";
import { assert } from "console";
import { writeFileSync } from "fs";
import path = require('node:path');

export class CompilationResult
{
    program_header: ProgramHeader;
    process_file_result: ProcessFileResult;
    parser_context: ParserContext;

    constructor(program_header: ProgramHeader, process_file_result: ProcessFileResult, parser_context: ParserContext)
    {
        this.program_header = program_header;
        this.process_file_result = process_file_result;
        this.parser_context = parser_context;
    }
}

export function compile(program_header: ProgramHeader)
{
    // Construct a parser context...
    const parser_context = new ParserContext();
    parser_context.active_file = program_header.main;
    parser_context.working_directory = program_header.working_directory;
    parser_context.active_template = null;

    // Add the sprites, sounds and music
    for (let music_index = 0; music_index < program_header.music.length; music_index++)
    {
        parser_context.music.set(program_header.music[music_index], music_index);
    }
    for (let sound_index = 0; sound_index < program_header.sounds.length; sound_index++)
    {
        parser_context.sounds.set(program_header.sounds[sound_index], sound_index);
    }
    for (let sprite_index = 0; sprite_index < program_header.sprites.length; sprite_index++)
    {
        parser_context.sprites.set(program_header.sprites[sprite_index], sprite_index);
    }

    const processed_file = process_file(program_header.main, parser_context);
    resolve_labels(program_header, processed_file);
    return new CompilationResult(program_header, processed_file, parser_context);
}

// Magic at the start of every executable file
export const PROGRAM_HEADER_MAGIC = 0xFEEDC0FFEEn;

/**
 * Convert the program header (excluding assets) to bytes
 * @param program_header the program header
 * @returns the bytes representing the program header
 */
export function program_header_to_bytes(program_header: ProgramHeader): Uint8Array
{
    const magic_bytes = bigint_to_bytes64(PROGRAM_HEADER_MAGIC);
    const view_width_bytes = bigint_to_bytes64(program_header.screen_width);
    const view_height_bytes = bigint_to_bytes64(program_header.screen_height);
    const fps_bytes = bigint_to_bytes64(program_header.fps);
    const code_address_bytes = bigint_to_bytes64(program_header.code_address);
    const memory_bytes = bigint_to_bytes64(program_header.memory);

    return concat_bytes([magic_bytes, view_width_bytes, view_height_bytes, fps_bytes, code_address_bytes, memory_bytes]);
}

/**
 * Asset types in the binary format
 * 
 * Assets are stored in the format:
 * <2 byte type> | <6 byte length> | <extension padded to 8 bytes with a null terminator> | <bytes... padded to 8 bytes>
 */
enum AssetTypes {
	NO_ASSET = 0,     // we assume this is zero below
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
    const asset_bytes = [];
    program_header.music.forEach(music_entry => {
        const file_type_bytes = bigint_to_bytes16(AssetTypes.MUSIC_ASSET);
        let file_bytes = file_to_bytes(music_entry);
        const file_length_bytes = bigint_to_bytes48(file_bytes.length);
        file_bytes = right_pad_bytes(file_bytes, 8);
        const file_extension = path.parse(music_entry).ext;
        const file_extension_bytes = right_pad_bytes(string_to_bytes(file_extension), 8);

        asset_bytes.push(concat_bytes([file_type_bytes, file_length_bytes, file_extension_bytes, file_bytes]));
    });

    program_header.sounds.forEach(sound_entry => {
        const file_type_bytes = bigint_to_bytes16(AssetTypes.SOUND_ASSET);
        let file_bytes = file_to_bytes(sound_entry);
        const file_length_bytes = bigint_to_bytes48(file_bytes.length);
        file_bytes = right_pad_bytes(file_bytes, 8);
        const file_extension = path.parse(sound_entry).ext;
        const file_extension_bytes = right_pad_bytes(string_to_bytes(file_extension), 8);

        asset_bytes.push(concat_bytes([file_type_bytes, file_length_bytes, file_extension_bytes, file_bytes]));
    });

    program_header.sprites.forEach(sprite_entry => {
        const file_type_bytes = bigint_to_bytes16(AssetTypes.SPRITE_ASSET);
        let file_bytes = file_to_bytes(sprite_entry);
        const file_length_bytes = bigint_to_bytes48(file_bytes.length);
        file_bytes = right_pad_bytes(file_bytes, 8);
        const file_extension = path.parse(sprite_entry).ext;
        const file_extension_bytes = right_pad_bytes(string_to_bytes(file_extension), 8);

        asset_bytes.push(concat_bytes([file_type_bytes, file_length_bytes, file_extension_bytes, file_bytes]));
    });

    // Finally add the null terminator (no_asset)
    asset_bytes.push(new Uint8Array([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]));

    return concat_bytes(asset_bytes);
}

/**
 * How instructions are written into machine code.
 * This should match Godot's interpretation
 */
enum InstructionType
{
	NOP = 0,
	STORE = 1,
	COPY = 2,
	ADD = 3,
	MULTIPLY = 4,
	SUBTRACT = 5,
	DIVIDE = 6,
	IS_NOT_EQUAL = 7,
	IS_EQUAL = 8,
	IS_LESS_THAN = 9,
	IS_GREATER_THAN = 10,
	IS_LESS_THAN_OR_EQUAL = 11,
	IS_GREATER_THAN_OR_EQUAL = 12,
	JUMP = 13,
	MODULO = 14,
	BITWISE_XOR = 15,
	BITWISE_OR = 16,
	BITWISE_AND = 17,
	BITWISE_NOT = 18,
	DRAW_COLOUR = 19,
	DRAW_SPRITE = 20,
	DRAW_CLEAR = 21,
	MUSIC_PLAY = 22,
	MUSIC_STOP = 23,
	SOUND_PLAY = 24,
	GET_EVENT = 25,
	WAIT_FRAME = 26,
	EXIT = 27,
	GET_MOUSE_POSITION = 28,
    TICKS = 29
}

export function operation_to_instructon(operation: OperationType): InstructionType
{
    switch (operation)
    {
        case OperationType.Add:
            return InstructionType.ADD;
        case OperationType.Bitwise_And:
            return InstructionType.BITWISE_AND;
        case OperationType.Bitwise_Or:
            return InstructionType.BITWISE_OR;
        case OperationType.Bitwise_Xor:
            return InstructionType.BITWISE_XOR;
        case OperationType.Copy:
            return InstructionType.COPY;
        case OperationType.Divide:
            return InstructionType.DIVIDE;
        case OperationType.Draw:
            return InstructionType.DRAW_SPRITE;
        case OperationType.Fill:
            return InstructionType.DRAW_COLOUR;
        case OperationType.Is_Equal:
            return InstructionType.IS_EQUAL;
        case OperationType.Is_Greater_Than:
            return InstructionType.IS_GREATER_THAN;
        case OperationType.Is_Greater_Than_Or_Equal:
            return InstructionType.IS_GREATER_THAN_OR_EQUAL;
        case OperationType.Is_Less_Than:
            return InstructionType.IS_LESS_THAN;
        case OperationType.Is_Less_Than_Or_Equal:
            return InstructionType.IS_LESS_THAN_OR_EQUAL;
        case OperationType.Is_Not_Equal:
            return InstructionType.IS_NOT_EQUAL;
        case OperationType.Jump:
            return InstructionType.JUMP;
        case OperationType.Modulo:
            return InstructionType.MODULO;
        case OperationType.Multiply:
            return InstructionType.MULTIPLY;
        case OperationType.Play_Music:
            return InstructionType.MUSIC_PLAY;
        case OperationType.Play_Sound:
            return InstructionType.SOUND_PLAY;
        case OperationType.Store:
            return InstructionType.STORE;
        case OperationType.Subtract:
            return InstructionType.SUBTRACT;
        case OperationType.Clear:
            return InstructionType.DRAW_CLEAR;
        case OperationType.Bitwise_Not:
            return InstructionType.BITWISE_NOT;
        case OperationType.Wait:
            return InstructionType.WAIT_FRAME;
        case OperationType.Stop_Music:
            return InstructionType.MUSIC_STOP;
        case OperationType.No_Operation:
            return InstructionType.NOP;
        case OperationType.Get_Event:
            return InstructionType.GET_EVENT;
        case OperationType.Get_Mouse_Position:
            return InstructionType.GET_MOUSE_POSITION;
        case OperationType.Get_Ticks:
            return InstructionType.TICKS;
        case OperationType.Exit:
            return InstructionType.EXIT;
    }
}

/**
 * Output the bytes corresponding to the compiled program
 * @param compilation_result the compilation of the program
 */
export function instructions_to_bytes(compilation_result: CompilationResult): Uint8Array
{
    const instruction_bytes: Uint8Array[] = [];
    compilation_result.process_file_result.instructions.forEach(instruction => {
        if (instruction instanceof Instruction && !(instruction.arg1 instanceof Label) && !(instruction.arg2 instanceof Label))
        {
            const instruction_type = bigint_to_bytes16(operation_to_instructon(instruction.type));
            const arg1 = bigint_to_bytes48(instruction.arg1);
            const arg2 = bigint_to_bytes64(instruction.arg2);
            const all_bytes = concat_bytes([instruction_type, arg1, arg2]);
            instruction_bytes.push(all_bytes);
        }
        else
        {
            assert(false, "No instructions should have been left unresolved");
        }
    });
    return concat_bytes(instruction_bytes);
}

export function write_binary(bytes: Uint8Array, out_file: string)
{
    writeFileSync(out_file, bytes);
}

/**
 * Output the compiled binary to an executable file
 * @param compilation_result the compiled program to export
 * @param out_file where to write the final binary
 */
export function output_binary(compilation_result: CompilationResult, out_file: string): boolean
{
    if (!compilation_result.process_file_result.success)
    {
        console.log("Will not output binary when compilation failed");
        return false;
    }

    const program_header_bytes: Uint8Array = program_header_to_bytes(compilation_result.program_header);
    const asset_bytes: Uint8Array = assets_to_bytes(compilation_result.program_header);
    const instruction_bytes: Uint8Array = instructions_to_bytes(compilation_result);

    const file_bytes = concat_bytes([program_header_bytes, asset_bytes, instruction_bytes]);
    write_binary(file_bytes, out_file);
    return true;
}