extends Node

# Implements various operations, mostly Mathemartical

@onready
var Errors: Errors = get_node("/root/Errors")

@onready
var Memory: Memory = get_node("/root/Memory")

var start_ticks_milliseconds = 0
var has_randomised: bool = false;

func init():
	if not has_randomised:
		randomize()
		has_randomised = true
	start_ticks_milliseconds = Time.get_ticks_msec()

# "Normal" Maths operations
func add(address_target, address_source):
	var left = Memory.read(address_target)
	var right = Memory.read(address_source)
	if Errors.errno != Errors.SUCCESS:
		return
	
	Memory.write(address_target, left + right)

func multiply(address_target, address_source):
	var left = Memory.read(address_target)
	var right = Memory.read(address_source)
	if Errors.errno != Errors.SUCCESS:
		return
	
	Memory.write(address_target, left * right)

func subtract(address_target, address_source):
	var left = Memory.read(address_target)
	var right = Memory.read(address_source)
	if Errors.errno != Errors.SUCCESS:
		return
	
	Memory.write(address_target, left - right)

func divide(address_target, address_source):
	var left = Memory.read(address_target)
	var right = Memory.read(address_source)
	if Errors.errno != Errors.SUCCESS:
		return
	
	Memory.write(address_target, left / right)

func modulo(address_target, address_source):
	var left = Memory.read(address_target)
	var right = Memory.read(address_source)
	if Errors.errno != Errors.SUCCESS:
		return
	
	Memory.write(address_target, left % right)

# Bitwise Maths operations
func bitwise_and(address_target, address_source):
	var left = Memory.read(address_target)
	var right = Memory.read(address_source)
	if Errors.errno != Errors.SUCCESS:
		return
	
	Memory.write(address_target, left & right)

func bitwise_or(address_target, address_source):
	var left = Memory.read(address_target)
	var right = Memory.read(address_source)
	if Errors.errno != Errors.SUCCESS:
		return
	
	Memory.write(address_target, left | right)

func bitwise_xor(address_target, address_source):
	var left = Memory.read(address_target)
	var right = Memory.read(address_source)
	if Errors.errno != Errors.SUCCESS:
		return
	
	Memory.write(address_target, left ^ right)
	
func bitwise_not(address):
	var left = Memory.read(address)
	if Errors.errno != Errors.SUCCESS:
		return
	
	Memory.write(address, ~left)

func is_not_equal(address_target, address_source):
	var left = Memory.read(address_target)
	var right = Memory.read(address_source)
	if Errors.errno != Errors.SUCCESS:
		return
	
	if left != right:
		Memory.write(Memory.RETURN, 1)
	else:
		Memory.write(Memory.RETURN, 0)

func is_equal(address_target, address_source):
	var left = Memory.read(address_target)
	var right = Memory.read(address_source)
	if Errors.errno != Errors.SUCCESS:
		return
	
	if left == right:
		Memory.write(Memory.RETURN, 1)
	else:
		Memory.write(Memory.RETURN, 0)

func is_less_than(address_target, address_source):
	var left = Memory.read(address_target)
	var right = Memory.read(address_source)
	if Errors.errno != Errors.SUCCESS:
		return
	
	if left < right:
		Memory.write(Memory.RETURN, 1)
	else:
		Memory.write(Memory.RETURN, 0)

func is_less_than_or_equal(address_target, address_source):
	var left = Memory.read(address_target)
	var right = Memory.read(address_source)
	if Errors.errno != Errors.SUCCESS:
		return
	
	if left <= right:
		Memory.write(Memory.RETURN, 1)
	else:
		Memory.write(Memory.RETURN, 0)

func is_bigger_than(address_target, address_source):
	var left = Memory.read(address_target)
	var right = Memory.read(address_source)
	if Errors.errno != Errors.SUCCESS:
		return
	
	if left > right:
		Memory.write(Memory.RETURN, 1)
	else:
		Memory.write(Memory.RETURN, 0)

func is_bigger_than_or_equal(address_target, address_source):
	var left = Memory.read(address_target)
	var right = Memory.read(address_source)
	if Errors.errno != Errors.SUCCESS:
		return
	
	if left >= right:
		Memory.write(Memory.RETURN, 1)
	else:
		Memory.write(Memory.RETURN, 0)

func jump(conditional_address, jump_target_address):
	var condition = Memory.read(conditional_address)
	var jump = Memory.read(jump_target_address)
	if Errors.errno != Errors.SUCCESS:
		return
	
	if condition != 0:
		Memory.write(Memory.INSTRUCTION_POINTER, jump)

func random():
	# Generate a random 64 bit signed number
	var random_bytes = []
	for i in range(0, 8):
		random_bytes.push_back(randi_range(0, 255))
	
	var final_number = PackedByteArray(random_bytes).decode_s64(0)
	Memory.write(Memory.RETURN, final_number);

func ticks():
	var ts = Time.get_ticks_msec() - start_ticks_milliseconds
	Memory.write(Memory.RETURN, ts)
