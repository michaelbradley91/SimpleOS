extends Node

# A collection of possible error codes!

const SUCCESS = 0
const NO_ERR = SUCCESS
const MEMORY_OUT_OF_BOUNDS_ERROR = 1
const NO_SUCH_SPRITE_ERROR = 2
const UNKNOWN_AUDIO_FORMAT = 3
const NO_SUCH_MUSIC_ERROR = 4
const NO_SUCH_SOUND_ERROR = 5
const MACHINE_CODE_MISSING_HEADER = 6
const UNKNOWN_INSTRUCTION = 7

# Used to indicate errors have occurred
var errno = SUCCESS
