extends TextureRect

@onready
var Video: Video = get_node("/root/Video")

# Called when the node enters the scene tree for the first time.
func _ready():
	pass
# Called every frame. 'delta' is the elapsed time since the previous frame.
func _process(delta):
	pass

var first_pass = true

func _draw():
	Video.lock_draw_instructions()
	var draw_instructions = Video.get_draw_instructions()

	# There is a strange glitch in the timing of drawing. If we clear the drawing out
	# too fast, it seems like it fails to draw at all, but only for the first frame
	if first_pass:
		first_pass = false
	else:
		Video.clear_draw_instructions()
	Video.unlock_draw_instructions()
	
	for draw_instruction in draw_instructions:
		draw_instruction.call(self)
