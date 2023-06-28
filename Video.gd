extends Node

@onready
var Memory: Memory = get_node("/root/Memory")

@onready
var MachineCodeTranslator: MachineCodeTranslator = get_node("/root/MachineCodeTranslator")

var draw_mutex: Mutex = Mutex.new()

var draw_instructions = []

func lock_draw_instructions():
	draw_mutex.lock()

func unlock_draw_instructions():
	draw_mutex.unlock()

func get_draw_instructions():
	print("getting draw instructions: ", draw_instructions.size())
	return draw_instructions

func clear_draw_instructions():
	draw_instructions = []

# Controls drawing to the screen!
class Rectangle:
	var x: int
	var y: int
	var width: int
	var height: int
	
	func _init(value: int):
		height = value & 0xFFFF
		width = (value >> (2 * 8)) & 0xFFFF
		y = (value >> (4 * 8)) & 0xFFFF
		x = (value >> (6 * 8)) & 0xFFFF
	
	func as_int() -> int:
		var value = 0
		value += height
		value += (width << (2 * 8))
		value += (y << (4 * 8))
		value += (x << (6 * 8))
		return value
	
	func as_rect() -> Rect2:
		return Rect2(x, y, width, height)

func new_rectangle(x: int, y: int, width: int, height: int) -> Rectangle:
	var rectangle = Rectangle.new(0)
	rectangle.x = x
	rectangle.y = y
	rectangle.width = width
	rectangle.height = height
	return rectangle

class Colour:
	var red: int
	var green: int
	var blue: int
	var alpha: int
	
	func _init(value: int):
		alpha = value & 0xFF
		blue = (value >> (1 * 8)) & 0xFF
		green = (value >> (2 * 8)) & 0xFF
		red = (value >> (3 * 8)) & 0xFF
	
	func as_color() -> Color:
		return Color8(red, green, blue, alpha)
	
	func as_int() -> int:
		var value = 0
		value += alpha & 0xFF
		value += ((blue & 0xFF) << (1 * 8))
		value += ((green & 0xFF) << (2 * 8))
		value += ((red & 0xFF) << (3 * 8))
		return value

func new_colour(red: int, green: int, blue: int, alpha: int) -> Colour:
	var colour = Colour.new(0)
	colour.red = red
	colour.green = green
	colour.blue = blue
	colour.alpha = alpha
	return colour

var images: Array[ImageTexture] = []

func load_image(path: String) -> ImageTexture:
	var image = Image.load_from_file(path)
	image.decompress()
	image.convert(Image.FORMAT_RGBA8)
	var image_texture = ImageTexture.create_from_image(image)
	return image_texture

func load_assets(sprites: Array[MachineCodeTranslator.Asset]):
	# Load all the assets for the program ahead of their use
	for sprite in sprites:
		var file_path = "user://temp_resource." + sprite.extension;
		var file = FileAccess.open(file_path, FileAccess.WRITE);
		file.store_buffer(sprite.bytes);
		file.close()
		
		images.append(load_image(file_path))
	
	print("Images loaded")

func unload(view_width: int, view_height: int):
	images.clear()
	draw_mutex.lock()
	draw_instructions.push_back(func(node):
		node.draw_rect(
			new_rectangle(0, 0, view_width, view_height).as_rect(),
			new_colour(0, 0, 0, 255).as_color(),
			true)
	)
	draw_mutex.unlock()

func draw_colour(rectangle_address: int, colour_address: int):
	var rectangle = Rectangle.new(Memory.read(rectangle_address))
	var colour = Colour.new(Memory.read(colour_address))
	if Errors.errno != Errors.SUCCESS:
		return
	print("Adding to draw instructions")
	draw_mutex.lock()
	draw_instructions.push_back(func(node):
		node.draw_rect(rectangle.as_rect(), colour.as_color(), true)
	)
	draw_mutex.unlock()

func draw_sprite(rectangle_address: int, sprite_address: int):
	var rectangle = Rectangle.new(Memory.read(rectangle_address))
	var sprite_index = Memory.read(sprite_address)
	if Errors.errno != Errors.SUCCESS:
		return
	
	if sprite_index >= images.size() or sprite_index < 0:
		print("Sprite index %s not found. Sprites loaded: %s -> %s" % [sprite_index, 0, images.size()])
		Errors.errno = Errors.NO_SUCH_SPRITE_ERROR
		return
	
	print("Adding to draw instructions")
	draw_mutex.lock()
	draw_instructions.push_back(func(node):
		node.draw_texture_rect(images[sprite_index], rectangle.as_rect(), false)
	)
	draw_mutex.unlock()

func clear(rectangle_address: int):
	draw_colour(rectangle_address, Memory.SCREEN_DEFAULT_COLOUR)
	
