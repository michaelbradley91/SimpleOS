extends Node2D

# The main computer of the game! Handles reading programs and executing them to completion! :)

@onready
var Operations: Operations = get_node("/root/Operations")

@onready
var Errors: Errors = get_node("/root/Errors")

@onready
var Memory: Memory = get_node("/root/Memory")

@onready
var GlobalInput: GlobalInput = get_node("/root/GlobalInput")

@onready
var MachineCodeTranslator: MachineCodeTranslator = get_node("/root/MachineCodeTranslator")

@onready
var music_player: AudioStreamPlayer = $MusicPlayer

@onready
var sound_player: AudioStreamPlayer = $SoundPlayer

@onready
var computer_sound_player: AudioStreamPlayer = $ComputerSoundPlayer

@onready
var file_dialog: FileDialog = $FileDialog

@onready
var program_canvas: Node2D = self

@onready
var cat_meow: AudioStream = AudioImport.loadfile("res://Art/kitty-meow-85182.mp3")

@onready
var floppy_disk_insert: AudioStream = AudioImport.loadfile("res://Art/inserting_floppy_disc-93172.mp3")

@onready
var computer_startup: AudioStream = AudioImport.loadfile("res://Art/start-computeraif-14572.mp3")

var current_program: MachineCodeTranslator.MachineCode = null

func load_program(program_path: String):
	# Reset errors
	Errors.errno = Errors.NO_ERR
	
	# Read in the machine code
	var file = FileAccess.open(program_path, FileAccess.READ)
	var bytes = file.get_buffer(file.get_length())
	file.close()
	
	# Parse the machine code first
	current_program = MachineCodeTranslator.parse_machine_code(bytes)
	
	# Now load all the assets
	var music: Array[MachineCodeTranslator.Asset] = []
	var sounds: Array[MachineCodeTranslator.Asset] = []
	var sprites: Array[MachineCodeTranslator.Asset] = []
	
	for asset in current_program.assets:
		if asset.type == MachineCodeTranslator.ASSET_TYPES.MUSIC_ASSET:
			music.append(asset)
		elif asset.type == MachineCodeTranslator.ASSET_TYPES.SOUND_ASSET:
			sounds.append(asset)
		elif asset.type == MachineCodeTranslator.ASSET_TYPES.SPRITE_ASSET:
			sprites.append(asset)
		elif asset.type == MachineCodeTranslator.ASSET_TYPES.NO_ASSET:
			continue
		else:
			print("Unknown asset type %s" % asset.type)
	
	# Clear out old assets
	music_player.stop()
	sound_player.stop()
	music_player.stream = null
	sound_player.stream = null
	Audio.unload()
	Video.unload()
	
	# Load in the new ones
	Audio.load_music(music)
	Audio.load_sounds(sounds)
	Video.load_assets(sprites)
	
	# Now initiliase the program memory
	Memory.initialise(current_program.header.memory_size)
	var code_address = current_program.header.code_address
	for instruction in current_program.instructions:
		var instruction_parts = instruction.as_ints()
		for instruction_part in instruction_parts:
			Memory.write(code_address, instruction_part)
			code_address += 1
	
	# We need to update certain special locations
	Memory.write(Memory.SCREEN_DEFAULT_COLOUR, 0x000000FF)
	Memory.write(Memory.FRAMES_PER_SECOND, current_program.header.fps)
	Memory.write(Memory.INSTRUCTION_POINTER, current_program.header.code_address)
	
	# Empty out the event queue
	GlobalInput.clear_event_queue()
	
	# We are now ready to run!

# Called when the node enters the scene tree for the first time.
func _ready():
	if cat_meow is AudioStreamWAV:
		cat_meow.loop_mode = 0
	else:
		cat_meow.loop = false
	
	if floppy_disk_insert is AudioStreamWAV:
		floppy_disk_insert.loop_mode = 0
	else:
		floppy_disk_insert.loop = false
	
	if computer_startup is AudioStreamWAV:
		computer_startup.loop_mode = 0
	else:
		computer_startup.loop = false
	
	computer_sound_player.stream = computer_startup
	computer_sound_player.volume_db = linear_to_db(30000 / 65535.0)
	computer_sound_player.play()
	
	load_program("C:\\Users\\micha\\repos\\SimpleOS\\Compiler\\example\\example.sosexe")
	
func _draw():
	pass

func _unhandled_input(event: InputEvent):
	# Remember the input event so it can be processed next time
	GlobalInput.queue_event(event)

func trigger_draw():
	program_canvas.queue_redraw()

func process_instruction(instruction: MachineCodeTranslator.Instruction) -> bool:
	# Process an instruction. Return true if the program should try to process the next instruction
	# and false otherwise
	match instruction.type:
		MachineCodeTranslator.INSTRUCTIONS.NOP:
			return true
		MachineCodeTranslator.INSTRUCTIONS.STORE:
			Memory.write(instruction.arg1, instruction.arg2)
		MachineCodeTranslator.INSTRUCTIONS.COPY:
			Memory.copy(instruction.arg1, instruction.arg2)
		MachineCodeTranslator.INSTRUCTIONS.ADD:
			Operations.add(instruction.arg1, instruction.arg2)
		MachineCodeTranslator.INSTRUCTIONS.MULTIPLY:
			Operations.multiply(instruction.arg1, instruction.arg2)
		MachineCodeTranslator.INSTRUCTIONS.SUBTRACT:
			Operations.subtract(instruction.arg1, instruction.arg2)
		MachineCodeTranslator.INSTRUCTIONS.DIVIDE:
			Operations.divide(instruction.arg1, instruction.arg2)
		MachineCodeTranslator.INSTRUCTIONS.IS_NOT_EQUAL:
			Operations.is_not_equal(instruction.arg1, instruction.arg2)
		MachineCodeTranslator.INSTRUCTIONS.IS_EQUAL:
			Operations.is_equal(instruction.arg1, instruction.arg2)
		MachineCodeTranslator.INSTRUCTIONS.IS_LESS_THAN:
			Operations.is_less_than(instruction.arg1, instruction.arg2)
		MachineCodeTranslator.INSTRUCTIONS.IS_GREATER_THAN:
			Operations.is_bigger_than(instruction.arg1, instruction.arg2)
		MachineCodeTranslator.INSTRUCTIONS.IS_LESS_THAN_OR_EQUAL:
			Operations.is_less_than_or_equal(instruction.arg1, instruction.arg2)
		MachineCodeTranslator.INSTRUCTIONS.IS_GREATER_THAN_OR_EQUAL:
			Operations.is_bigger_than_or_equal(instruction.arg1, instruction.arg2)
		MachineCodeTranslator.INSTRUCTIONS.JUMP:
			Operations.jump(instruction.arg1, instruction.arg2)
		MachineCodeTranslator.INSTRUCTIONS.MODULO:
			Operations.modulo(instruction.arg1, instruction.arg2)
		MachineCodeTranslator.INSTRUCTIONS.BITWISE_XOR:
			Operations.bitwise_xor(instruction.arg1, instruction.arg2)
		MachineCodeTranslator.INSTRUCTIONS.BITWISE_OR:
			Operations.bitwise_or(instruction.arg1, instruction.arg2)
		MachineCodeTranslator.INSTRUCTIONS.BITWISE_AND:
			Operations.bitwise_and(instruction.arg1, instruction.arg2)
		MachineCodeTranslator.INSTRUCTIONS.BITWISE_NOT:
			Operations.bitwise_not(instruction.arg1)
		MachineCodeTranslator.INSTRUCTIONS.DRAW_COLOUR:
			Video.draw_colour(instruction.arg1, instruction.arg2, program_canvas)
			trigger_draw()
		MachineCodeTranslator.INSTRUCTIONS.DRAW_SPRITE:
			Video.draw_sprite(instruction.arg1, instruction.arg2, program_canvas)
			trigger_draw()
		MachineCodeTranslator.INSTRUCTIONS.DRAW_CLEAR:
			Video.clear(instruction.arg1, program_canvas)
			trigger_draw()
		MachineCodeTranslator.INSTRUCTIONS.MUSIC_PLAY:
			Audio.music_play(instruction.arg1, instruction.arg2, music_player)
		MachineCodeTranslator.INSTRUCTIONS.MUSIC_STOP:
			Audio.music_stop(music_player)
		MachineCodeTranslator.INSTRUCTIONS.SOUND_PLAY:
			Audio.sound_play(instruction.arg1, instruction.arg2, sound_player)
		MachineCodeTranslator.INSTRUCTIONS.GET_EVENT:
			GlobalInput.get_event()
		MachineCodeTranslator.INSTRUCTIONS.WAIT_FRAME:
			return false
		MachineCodeTranslator.INSTRUCTIONS.EXIT:
			return false
		MachineCodeTranslator.INSTRUCTIONS.GET_MOUSE_POSITION:
			GlobalInput.mouse_position()
		_:
			print("Unknown instruction error %s" % instruction.type)
			Errors.errno = Errors.UNKNOWN_INSTRUCTION
			return false
	return true

func exit_program():
	print("Program finished")
	
	# Remove all assets
	# Clear out old assets
	music_player.stop()
	sound_player.stop()
	music_player.stream = null
	sound_player.stream = null
	Audio.unload()
	Video.unload()
	Memory.initialise(1000)
	Errors.errno = Errors.NO_ERR
	current_program = null
	
	# TODO: reset the program canvas
	trigger_draw()

func abort_program():
	# TODO
	var instruction_pointer = Memory.read(Memory.INSTRUCTION_POINTER);
	print("Program crashed. Error %s" % Errors.errno)
	print("Instruction pointer. %s" % instruction_pointer);
	exit_program()

# Called every frame. 'delta' is the elapsed time since the previous frame.
func _process(delta):
	if current_program != null:
		# Update the frame delta
		Memory.write(Memory.FRAME_DELTA_MICROSECONDS, delta * 1000000)
		var start_time = Time.get_ticks_usec()
		var max_microseconds = 1000000 / current_program.header.fps
		while Time.get_ticks_usec() - start_time < max_microseconds:
			# Get the next instruction
			var next_instruction_address = Memory.read(Memory.INSTRUCTION_POINTER)
			if Errors.errno != 0:
				abort_program()
				break
			
			var instruction = MachineCodeTranslator.get_instruction_from_memory(next_instruction_address)
			# Write to memory now so if the operation itself writes to memory, it takes precedence
			Memory.write(Memory.INSTRUCTION_POINTER, next_instruction_address + 2)
			
			if Errors.errno != 0:
				abort_program()
				break
			
			var should_continue = process_instruction(instruction)
			print("Handling instruction %s" % instruction.type)
			if not should_continue:
				if instruction.type == MachineCodeTranslator.INSTRUCTIONS.EXIT:
					exit_program()
				break
			
			if Errors.errno != 0:
				abort_program()
				break

func _on_play_button_pressed():
	computer_sound_player.stream = floppy_disk_insert
	computer_sound_player.volume_db = linear_to_db(30000 / 65535.0)
	computer_sound_player.play()
	
	file_dialog.show()
	file_dialog.request_attention()

func _on_exit_button_pressed():
	get_tree().get_root().propagate_notification(NOTIFICATION_WM_CLOSE_REQUEST)
	get_tree().quit(0)

func _on_file_dialog_file_selected(path):
	file_dialog.hide()
	
	print("Loading program: " + path)

func _on_cat_pressed():
	computer_sound_player.stream = cat_meow
	computer_sound_player.volume_db = linear_to_db(30000 / 65535.0)
	computer_sound_player.play()
