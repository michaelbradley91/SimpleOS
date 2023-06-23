extends Node

@onready
var Errors: Errors = get_node("/root/Errors")

@onready
var AudioImport: AudioImport = get_node("/root/AudioImport")

@onready
var MachineCodeTranslator: MachineCodeTranslator = get_node("/root/MachineCodeTranslator")

# Handles all music and sound related operations

var music: Array[AudioStream] = []
var sounds: Array[AudioStream] = []

func unload():
	# Clean up all previously loaded resources
	for music_stream in music:
		music_stream.free()
	
	for sound_stream in sounds:
		sound_stream.free()
	
	music.clear()
	sounds.clear()

func load_music(music_files: Array[MachineCodeTranslator.Asset]):
	# Load all the assets for the program ahead of their use
	for music_file in music_files:
		var file_path = "user://temp_resource." + music_file.extension;
		var file = FileAccess.open(file_path, FileAccess.WRITE);
		file.store_buffer(music_file.bytes);
		file.close()
		
		var stream: AudioStream = AudioImport.loadfile(file_path)
		if stream is AudioStreamWAV:
			stream.loop_mode = 1
		else:
			stream.loop = true
		
		music.append(stream)

func load_sounds(sound_files: Array[MachineCodeTranslator.Asset]):
	# Load all the assets for the program ahead of their use
	for sound_file in sound_files:
		var file_path = "user://temp_resource." + sound_file.extension;
		var file = FileAccess.open(file_path, FileAccess.WRITE);
		file.store_buffer(sound_file.bytes);
		file.close()
		
		var stream: AudioStream = AudioImport.loadfile(file_path)
		if stream is AudioStreamWAV:
			stream.loop_mode = 0
		else:
			stream.loop = false
		sounds.append(stream)
	
func music_play(volume_address: int, music_address: int, audio_stream_player: AudioStreamPlayer):
	var volume = Memory.read(volume_address)
	var music_index = Memory.read(music_address)
	if Errors.errno != Errors.SUCCESS:
		return
	
	if music_index >= music.size() or music_index < 0:
		print("Music index %s not found. Music loaded: %s -> %s" % [music_index, 0, music.size()])
		Errors.errno = Errors.NO_SUCH_MUSIC_ERROR
		return
	
	# TODO: play something!
	audio_stream_player.stream = music[music_index]
	audio_stream_player.volume_db = linear_to_db(volume / 65535.0)
	audio_stream_player.play()

func music_stop(audio_stream_player: AudioStreamPlayer):
	audio_stream_player.stop()

func sound_play(volume_address: int, sound_address: int, audio_stream_player: AudioStreamPlayer):
	var volume = Memory.read(volume_address)
	var sound_index = Memory.read(sound_address)
	if Errors.errno != Errors.SUCCESS:
		return
	
	if sound_index >= sounds.size() or sound_index < 0:
		print("Sound index %s not found. Sounds loaded: %s -> %s" % [sound_index, 0, sounds.size()])
		Errors.errno = Errors.NO_SUCH_SOUND_ERROR
		return
	
	audio_stream_player.stream = sounds[sound_index]
	audio_stream_player.volume_db = linear_to_db(volume / 65535.0)
	audio_stream_player.play()

func sound_stop(audio_stream_player: AudioStreamPlayer):
	audio_stream_player.stop()
