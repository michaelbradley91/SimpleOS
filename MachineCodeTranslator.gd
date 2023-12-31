extends Node

@onready
var Errors: Errors = get_node("/root/Errors")

@onready
var Memory: Memory = get_node("/root/Memory")

# This script handles parsing the machine code of the language into a set of instructions
# Every instruction is exactly 16 bytes long. The format of the binary varies a little by
# instruction, but generally:

# 
# Op code format:
# 
# | 2 bytes | 6 bytes | 8 bytes    |
# | op type | addr    | addr / val |
#
# Note instructions are 16 byte aligned as well, so padding appears before them

# Where an instruction has fewer than two arguments, the extra space is zeroes
# (Although technically does not matter)

# Note we assume little endianness generally in this game. This will work as long as the system
# endianness matches the endianness used to build the machine code. TODO: handle both
# We also more technically assume a two's complement representation of negative numbers

enum INSTRUCTIONS
{
	NOP = 0,  # No operation
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
	TICKS = 29,
	RANDOM = 30,
	COPY_INDIRECT = 31
}

func instruction_type_to_string(type: int):
	match type:
		INSTRUCTIONS.NOP:
			return "nop"
		INSTRUCTIONS.STORE:
			return "store"
		INSTRUCTIONS.COPY:
			return "copy"
		INSTRUCTIONS.ADD:
			return "add"
		INSTRUCTIONS.MULTIPLY:
			return "mul"
		INSTRUCTIONS.SUBTRACT:
			return "sub"
		INSTRUCTIONS.DIVIDE:
			return "div"
		INSTRUCTIONS.IS_NOT_EQUAL:
			return "neq"
		INSTRUCTIONS.IS_EQUAL:
			return "eq"
		INSTRUCTIONS.IS_LESS_THAN:
			return "lt"
		INSTRUCTIONS.IS_GREATER_THAN:
			return "gt"
		INSTRUCTIONS.IS_LESS_THAN_OR_EQUAL:
			return "lte"
		INSTRUCTIONS.IS_GREATER_THAN_OR_EQUAL:
			return "gte"
		INSTRUCTIONS.JUMP:
			return "jmp"
		INSTRUCTIONS.MODULO:
			return "mod"
		INSTRUCTIONS.BITWISE_XOR:
			return "xor"
		INSTRUCTIONS.BITWISE_OR:
			return "or"
		INSTRUCTIONS.BITWISE_AND:
			return "and"
		INSTRUCTIONS.BITWISE_NOT:
			return "not"
		INSTRUCTIONS.DRAW_COLOUR:
			return "fill"
		INSTRUCTIONS.DRAW_SPRITE:
			return "draw"
		INSTRUCTIONS.DRAW_CLEAR:
			return "clear"
		INSTRUCTIONS.MUSIC_PLAY:
			return "play_music"
		INSTRUCTIONS.MUSIC_STOP:
			return "stop_music"
		INSTRUCTIONS.SOUND_PLAY:
			return "play_sound"
		INSTRUCTIONS.GET_EVENT:
			return "get_event"
		INSTRUCTIONS.RANDOM:
			return "random"
		INSTRUCTIONS.WAIT_FRAME:
			return "wait"
		INSTRUCTIONS.EXIT:
			return "exit"
		INSTRUCTIONS.GET_MOUSE_POSITION:
			return "get_mouse"
		INSTRUCTIONS.TICKS:
			return "get_ticks"
		INSTRUCTIONS.COPY_INDIRECT:
			return "copy_indirect"
		_:
			return "unknown"

class Instruction:
	var type: int
	var arg1: int
	var arg2: int
	var original_int_1: int
	var original_int_2: int
	
	func _init(bytes: PackedByteArray, offset: int):
		if bytes.size() == 0:
			return
		
		type = bytes.decode_u16(offset)
		# The six byte value is tricky. We need to do a signed extension...
		
		var arg1_temp = bytes.slice(offset + 2, offset + 8)
		if bytes.decode_s8(offset + 7) < 0:
			arg1_temp.append(0xFF)
			arg1_temp.append(0xFF)
		else:
			arg1_temp.append(0)
			arg1_temp.append(0)
		arg1 = arg1_temp.decode_s64(0)
		
		arg2 = bytes.decode_s64(offset + 8)
	
	func as_ints():
		# We need to make this signed but in 6 bytes...
		var signed_bytes: PackedByteArray = PackedByteArray([0,0,0,0,0,0,0,0])
		signed_bytes.encode_s64(0, arg1)
		signed_bytes.set(6, 0)
		signed_bytes.set(7, 0)
		var unsigned_arg1 = signed_bytes.decode_u64(0)
		var result = [((type & 0xFFFF) << (6 * 8)) + (unsigned_arg1 & 0xFFFFFFFFFFFF), arg2]
		return result
	
	func size():
		return 16


func get_instruction_from_memory(address: int) -> Instruction:
	# Read an instruction back out of memory
	var first_part = Memory.read(address)
	var second_part = Memory.read(address + 1)
	if Errors.errno != 0:
		return
	
	var bytes = PackedByteArray([])
	var instruction = Instruction.new(bytes, 0)
	instruction.type = (first_part >> (6 * 8)) & 0xFFFF
	instruction.arg1 = first_part & 0x0000FFFFFFFFFFFF
	if (instruction.arg1 >= 0x0000800000000000):
		# The sign bit is set
		var arg1_fix: PackedByteArray = PackedByteArray([0, 0, 0, 0, 0, 0, 0, 0])
		arg1_fix.encode_u64(0, instruction.arg1)
		arg1_fix.set(7, 0xFF)
		arg1_fix.set(6, 0xFF)
		instruction.arg1 = arg1_fix.decode_s64(0)
	
	# Arg 1 might be signed in the first 6 bytes, so check it
	instruction.arg2 = second_part
	return instruction

# Assets appear in the header of a program and point to paths on the file system
# They are terminated by a "no asset" entry
# <2 byte type> | <6 byte length> | <extension padded to 8 bytes with a null terminator> | <bytes... padded to 8 bytes>
enum ASSET_TYPES {
	NO_ASSET = 0,
	SPRITE_ASSET = 1,
	MUSIC_ASSET = 2,
	SOUND_ASSET = 3
}

class Asset:
	var type: int
	var extension: String
	var bytes: PackedByteArray
	
	func _init(passed_bytes: PackedByteArray, offset: int):
		type = passed_bytes.decode_u16(offset)
		var length = passed_bytes.decode_u64(offset) >> 16;
		
		# Work out where the string is
		var end = passed_bytes.find(0, offset + 8)
		extension = passed_bytes.slice(offset + 8, end + 1).get_string_from_utf8()
		
		if (end % 8 != 0):
			end += 8 - (end % 8);
		
		self.bytes = passed_bytes.slice(end, end + length);
		
	func size():
		if (type == ASSET_TYPES.NO_ASSET):
			return 16
		
		var extension_bytes = extension.length() + 1
		if (extension_bytes % 8 != 0):
			extension_bytes += 8 - (extension_bytes % 8);
		var total_bytes_length = bytes.size();
		if (total_bytes_length % 8 != 0):
			total_bytes_length += 8 - (total_bytes_length % 8);
		return 8 + extension_bytes + total_bytes_length

# Finally, at the very top of the file are header values. Each entry is 8 bytes and
# and appears in the exact order of the class below:
const HEADER_SIZE_BYTES = 64
const HEADER_MAGIC = 0xFEEDC0FFEE # Magic to identify the start of the program
class Header:
	var magic: int
	var view_width: int
	var view_height: int
	var fps: int
	var code_address: int
	var memory_size: int
	var pixel_perfect: int
	
	func _init(bytes: PackedByteArray, offset: int):
		magic = bytes.decode_s64(offset)
		view_width = bytes.decode_s64(offset + 8)
		view_height = bytes.decode_s64(offset + 16)
		fps = bytes.decode_s64(offset + 24)
		code_address = bytes.decode_s64(offset + 32)
		memory_size = bytes.decode_s64(offset + 40)
		pixel_perfect = bytes.decode_s64(offset + 48)
	
	func size():
		return HEADER_SIZE_BYTES

# And at last a completely parsed file
class MachineCode:
	var header: Header
	var assets: Array[Asset]
	var instructions: Array[Instruction]
	
	func _init():
		assets = []
		instructions = []

func parse_machine_code(bytes: PackedByteArray) -> MachineCode:
	# Parse the machine code from the byte array so we can easily process it
	var machine_code = MachineCode.new()
	
	if bytes.size() < HEADER_SIZE_BYTES:
		print("File is too small to be a program")
		Errors.errno = Errors.MACHINE_CODE_MISSING_HEADER
		return machine_code
	
	machine_code.header = Header.new(bytes, 0)
	if machine_code.header.magic != HEADER_MAGIC:
		print("Header magic not found in program")
		Errors.errno = Errors.MACHINE_CODE_MISSING_HEADER
		return machine_code
	
	# Collect the assets
	var offset = HEADER_SIZE_BYTES
	while offset < bytes.size():
		var asset: Asset = Asset.new(bytes, offset)
		machine_code.assets.append(asset)
		offset += asset.size()
		if asset.type == ASSET_TYPES.NO_ASSET:
			break
	
	# Align the offset to a 16 byte boundary for the instructions
	if offset % 16 != 0:
		offset += 16 - (offset % 16)
	
	# Collect the instructions
	while offset < bytes.size():
		var instruction: Instruction = Instruction.new(bytes, offset)
		machine_code.instructions.append(instruction)
		offset += instruction.size()
	
	return machine_code
