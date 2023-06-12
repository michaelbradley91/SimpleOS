extends Node

# Handle differet kinds of user input

@onready
var Memory: Memory = get_node("/root/Memory")

const MAX_EVENT_QUEUE_SIZE = 1000

const UNKNOWN_EVENT_TYPE = -1
const NO_EVENT_TYPE = 0
const MOUSE_BUTTON_PRESSED = 1
const MOUSE_BUTTON_RELEASED = 2
const KEY_PRESSED = 3
const KEY_RELEASED = 4


class Event:
	var type: int
	var code: int
	
	# Position in the cse of mouse events
	var x: int
	var y: int
	
	func _init(event: InputEvent):
		if event is InputEventKey:
			if event.pressed:
				type = KEY_PRESSED
			else:
				type = KEY_RELEASED
			code = event.keycode
		elif event is InputEventMouseButton:
			if event.pressed:
				type = MOUSE_BUTTON_PRESSED
			else:
				type = MOUSE_BUTTON_RELEASED
			code = event.button_index
			x = event.position.x
			y = event.position.y
		else:
			type = UNKNOWN_EVENT_TYPE
	
	func as_int() -> int:
		var value = code
#		print("Value set to code %s" % code)
#		print("x is %s " % x)
#		print("y is %s " % y)
#		print("type is %s " % type)
		if type in [MOUSE_BUTTON_PRESSED, MOUSE_BUTTON_RELEASED]:
			value = value & 0xFFFF
#			print("Value is with code %s" % value)
			value += ((y & 0xFFFF) << (2 * 8))
#			print("Value is with y %s" % value)
			value += ((x & 0xFFFF) << (4 * 8))
#			print("Value is with x %s" % value)
		value = value & 0xFFFFFFFFFFFF
		value += (type << (6 * 8))
#		print("Value is with type %s" % value)
		return value

func event_from_int(event_value: int) -> Event:
	var event = Event.new(null)
	var type = (event_value >> (6 * 8)) & 0xFF
	var x = 0
	var y = 0
	var code = event_value & 0xFFFFFFFFFFFF
	if type in [MOUSE_BUTTON_PRESSED, MOUSE_BUTTON_RELEASED]:
		code = event_value & 0xFFFF
		y = (event_value >> (2 * 8)) & 0xFFFF
		x = (event_value >> (4 * 8)) & 0xFFFF
	
	event.x = x
	event.y = y
	event.code = code
	event.type = type
	
	return event

# Events are stored in an event queue
var _event_queue: Array[Event] = []

func clear_event_queue():
	_event_queue.clear()

func queue_event(event: InputEvent):
	# Do we care about this event?
	var processed_event = Event.new(event)
	if processed_event.type == UNKNOWN_EVENT_TYPE:
		return
	
	# Put an event into the internal event queue so the program can handle it
	if _event_queue.size() >= MAX_EVENT_QUEUE_SIZE:
		_event_queue.pop_back()
	
	_event_queue.push_front(processed_event)

func get_event():
	if _event_queue.is_empty():
		Memory.write(Memory.RETURN, NO_EVENT_TYPE)
	else:
		var event: Event = _event_queue.pop_back()
		Memory.write(Memory.RETURN, event.as_int())

func mouse_position():
	# Store the coordinates of the mouse
	var mouse_coordinate = get_viewport().get_mouse_position()
	var value = mouse_coordinate.y & 0xFFFF
	value += (mouse_coordinate.x & 0xFFFF) >> (2 * 8)
	Memory.write(Memory.RETURN, value)
