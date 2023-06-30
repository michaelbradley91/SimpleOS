extends Node

# Manages the memory of the computer

@onready
var Errors: Errors = get_node("/root/Errors")


var _memory: Array[int] = []

# Special memory locations
const INSTRUCTION_POINTER = -1
const RETURN = -2
const SCREEN_DEFAULT_COLOUR = -3
const FRAMES_PER_SECOND = -4
const FRAME_DELTA_MICROSECONDS = -5
const MIN_MEMORY_REQUIRED = 5

func initialise(size: int):
	# Initialise memory to zero with the given size
	# Refuse to go below a minimum
	if (size < MIN_MEMORY_REQUIRED):
		print("Allocating %s blocks of memory since %s is below the minimum required to run", MIN_MEMORY_REQUIRED, size)
		size = MIN_MEMORY_REQUIRED
	_memory.clear()
	_memory.resize(size)
	_memory.fill(0)
	print("Memory initialised to size %s" % size)


func _absolute_address(address: int) -> int:
	# Check the address is in bounds and "normalise" it (make it non-negative)
	# Returns normalised address. Errno will be set if there was an error
	if address >= _memory.size():
		print("Address %s is outside of memory ending at %s" % [address, _memory.size()])
		Errors.errno = Errors.MEMORY_OUT_OF_BOUNDS_ERROR
		return address

	
	# Permit some negative addresses within a reasonable range
	if address < 0:
		address += _memory.size()
		
	if address < 0:
		print("Address %s is outside of memory ending at %s" % [address, _memory.size(), _memory.size()])
		Errors.errno = Errors.MEMORY_OUT_OF_BOUNDS_ERROR
		return address - _memory.size()
	
	return address


func write(address: int, value: int):
	# Store a value in memory at the given address
	var absolute_address = _absolute_address(address)
	if Errors.errno != Errors.SUCCESS:
		return
	
	if absolute_address == 0x500:
		print("Writing to zero!")
	if absolute_address == 0x519:
		print("Writing to grid size!")
	_memory[absolute_address] = value

func copy_indirect(indirect_target_address: int, indirect_source_address: int):
	var absolute_indirect_target_address = _absolute_address(indirect_target_address)
	var absolute_indirect_source_address = _absolute_address(indirect_source_address)
	if Errors.errno != Errors.SUCCESS:
		return
	
	# Load the address at the indirect address...
	var target_address = _absolute_address(_memory[absolute_indirect_target_address])
	var source_address = _absolute_address(_memory[absolute_indirect_source_address])
	if Errors.errno != Errors.SUCCESS:
		return
	
	copy(target_address, source_address)

func copy(target_address: int, source_address: int):
	# Copy a value from one address to another
	var absolute_target_address = _absolute_address(target_address)
	var absolute_source_address = _absolute_address(source_address)
	if Errors.errno != Errors.SUCCESS:
		return
	
	if absolute_target_address == 0x500:
		print("Writing to zero!")
	if absolute_target_address == 0x519:
		print("Writing to grid size!")
	_memory[absolute_target_address] = _memory[absolute_source_address]

func read(address: int) -> int:
	var absolute_address = _absolute_address(address)
	if Errors.errno != Errors.SUCCESS:
		return -1
	
	return _memory[address]
