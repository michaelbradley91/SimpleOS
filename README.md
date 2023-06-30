# Simple OS
A simple Operating System to run games inside Godot.

## Overview

At the base of this repository is a Godot game that runs "Simple OS".
Inside Simple OS you can load Simple OS binaries or `sox` files. These
are then executed within the game.

So in this game you write games to run inside the game! :D

The general flow is as follows:

1. Install the VSCode Simple OS extension if you have not already. Download it [here](./VSCodeExtension/simple-os-1.0.0.vsix).
2. Create a new folder with nothing in it and open it with VSCode.
3. Populate your program configuration file: `hello_world.sos.json`.
4. Point `VSCode` to that file in `.vscode/settings.json`.
5. Write your assembly in `hello_world.sos` and supporting files.
6. Compile your program with the VSCode command to produce a `.sox` file.
7. Start Simple OS.
8. Load the `.sox` file and see if it works?

See below for details on the language and configuration.
There are two example programs in this repo itself under [Programs](./Programs):

* `HelloWorld` - just draws an image to the screen. Simplest to understand.
* `Tutorial` - loaded automatically by Godot when you start the game.

More may exist elsewhere..!

## Simple OS Configuration

The JSON file tells the Simple OS compiler how to compile your program,
being turned into bytes in the program header. Here is an example:

```json
{
    "code_address": 4096,
    "fps": 60,
    "memory": 8192,
    "music": [],
    "sounds": [],
    "sprites": [
        "./Assets/HelloWorldBanner.png"
    ],
    "screen_width": 1280,
    "screen_height": 720,
    "main": "hello_world.sos",
    "output_file": "hello_world.sox",
    "working_directory": "./",
    "pixel_perfect": false
}
```

Here is an explanation of each field:

* `code_address` - where the program's code is written in memory.
  * You should avoid writing over space you intend to use as data.
  * But you could update your own code on the fly if so inclined..!
* `fps` - the target frame rate for the game.
* `memory` - the amount of memory the game requires.
  * You should ensure this is big enough for your code and data
  * Assets are not stored in this memory so need to worry about those.
* `music` / `sounds` - arrays of music and sound files.
  * The supported formats are only: `.wav`, `.mp3`, `.ogg`.
* `sprites` - arrays of images.
  * We support all the image formats supported by Godot (I think).
  * There is no font support (yet), so images are probably the easiest way to convey textual information.
* `screen_width` / `screen_height` - the resolution of the game
  * You can use resolutions higher than the game's own, but the viewport will approximate what is drawn.
* `pixel_perfect` - when true, the viewport shownig your game uses nearest neighbour filtering.
  * Nearest neighbour is good for pixel art. Linear filternig is the default which will smooth / blur your sprites
    to reflect different resolutions.

If you stick to the file naming convention, these settings can be ignored. Otherwise:
* `main` - the entry point of the program.
* `output_file` - the name of the file to be produced by the compiler. Simple OS will expect the `.sox` extension.
* `working_directory` - when resolving includes or assets, this is added to the front of relative paths.
  * If relative itself, then the workspace folder is applied to the front of it.

Without settings, relative paths are resolved relative to the workspace directory. This makes it necessary to open a `Folder` in VSCode, not the individual files.

There is a [schema here](./VSCodeExtension/simple-os-config-schema.json) for the configuration file that the VSCode extension
will match to all `.sos.json` files that can help you to fill it in.

## Memory Layout

Code and data are stored in flat memory. There is no concept of a `heap` or `stack` - if you want these, it is up to you to implement them!

Memory is also fixed at program start, so I would request more than you need.

Addresses begin at `0` and continue up to the amount of memory your program
configuration requested.

All memory locations store 64 bit numeric values. This means for the majority of programs arithmetic is trivial as your numbers should fit in one memory address.

In operations, `-1` is taken to be the last address of memory, `-2` just before that and so on.

The special locations are:
* `-1` - the instruction pointer is stored here.
  * This is updated to point to the next instruction to execute by certain commands, and increments by 2 by default.
* `-2` - operations that return a value write it here.
* `-3` - the screen default colour if `clear` is used.
* `-4` - the FPS. Note this is not actually used right now.
* `-5` - frame delta. The amount of time that passed since the last frame. 
  * You can use `get_ticks` to work this out as well which is more reliable in case your frame times out..!

I would avoid changing the above addresses unless you are sure you know
what you are doing! The rest is entirely free to use however you want.

## Keyword Reference

These are the main directives of the assembly language besides the operations
themselves.

### `// or /* */`

These are comments and can be placed anywhere in the file. They are ignored
by the compiler. `/* */` is a multiline comment while `//` is a single line
comment, like `c` and other similar languages.

### `label:`

Any word with a colon on the end is treated as a label. When the program
is compiled, the labels are converted to the address of the first instruction
following the label (or that would follow the label).

For example, if this code were loaded into memory at `0x1000`:
```s
add 4 5
loop:
sub 3 4
JUMP(6, loop:)
exit
```

In memory, `add` would be at `0x1000` and `sub` would be at `0x1002`. (Every
operation requires 16 bytes which is 2 units of memory). Therefore, this would
compile to:

```s
add 4 5
loop:
sub 3 4
JUMP(6, 0x1002)
exit
```

If a label appears more than once, any use of the label is resolved
based on what is nearest. You can put a `b` or `f` after the colon
to indicate if you intend to jump forwards or backwards:

```
start:
JUMP(3, start:b)
JUMP(4, start:f)
start:
```

The first jump goes to the label before it, and the second jumps to the label
after it.

**Warning:** If you leave it ambiguous, there is no officially defined behaviour, although it is deterministic. See the code if you're interested but
I would just avoid ambiguity if I were you.

### `#constant NAME <constant>`

Name a constant value. This name can then be used in the place of arguments
to operations and inside templates. For simplicity they are not allowed
on an include directive.

Being constants, the value must evaluate to a constant. This can be a string
or number ultimately, but may use functions or other `#constant`'s to
reach this.

### `#template_begin NAME(X,Y) ... #template_end` 

Templates let you write blocks of code that are parameterised and can be reused.
For example:

```s
#template_begin JUMP_ON_CONDITION(COND, LABEL)
store JMP_ADDRESS LABEL
jmp COND JMP_ADDRESS
#template_end
```

The above could then be invoked with:
```s
eq EVENT_ADDRESS KEY_P_PRESSED
JUMP_ON_CONDITION(RETURN, start:)
```

The template here stores the label's address so it can be passed to
the template directly.

The arguments to a template can be any value a `#constant` could be,
so strings or numbers ultimately, and you can use functions to arrive
at these values.

A template must be a sequence of instructions. It can call out to other
templates and use existing `#constant`'s, but it cannot be part of a line.

### `#include "my path"`

Include the contents of another `.sos` file at this location. The file
is included as is, with no modifications, exactly where the `#include`
was.

The `path` must be a string. It cannot even be a `#constant`.
Relative paths are resolved according to the working directory,
which either comes from the program's configuration or by convention.

Typically, this means relative to the VSCode folder you are working in.

You can include the same file multiple times, but be aware you may be duplicating
effort for the compiler or even your own code.

## Encoding Reference

Some values from operations are encoded in 64 bit integers. This is the right format from a little endian system's perspective (which is all
Simple OS supports).

Note that there are functions that can help generate
numbers with the right encodings! See below.

### Rectangles

2 bytes | 2 bytes | 2 bytes | 2 bytes |
--- | --- | --- | --- |
height | width | y | x |

Any operation expecting a rectangle will expect it in this format.

### Colours

1 byte | 1 byte | 1 byte | 1 byte | 4 bytes |
--- | --- | --- | --- | --- |
a | b | g | r | padding |

The least signifiant `4` bytes define colours and alpha. (`r` = red etc).
So each colour component is a value from `0` to `255`. For alpha, `255`
is opaque and `0` is fully transparent.

### Events

These are events driven by the user. They are split into 2:
* Key events that just have a type and key code.
* Mouse events that have a type, button and location.

For mouse events:

2 bytes | 2 bytes | 2 bytes | 2 bytes | 
--- | --- | --- | --- |
button | y | x | type

Button here is a code corresponding to the mouse button. It will
match the Godot code. Type indicates if it was pressed or released.
See below.

For key events:
6 bytes | 2 bytes
--- | --- |
keycode | type

Keycode again matches the key's code in Godot.

For both key and mouse events, the type is one of:
```s
UNKNOWN_EVENT_TYPE = -1
NO_EVENT_TYPE = 0
MOUSE_BUTTON_PRESSED = 1
MOUSE_BUTTON_RELEASED = 2
KEY_PRESSED = 3
KEY_RELEASED = 4
```

### Coordinates

If an operation expects or returns purely a location, like
getting the mouse position, it will be in this format:

2 bytes | 2 bytes | 4 bytes |
--- | --- | --- |
y | x | padding |

### Assets

Functions that take an asset (sound, music, sprite etc)
will expect (an address to) a number referring to the index of that asset.

The index of the asset is `0` based and is its index into the JSON
array where it was listed in the program's configuration.

For example, with this configuration:

```json
{
    "code_address": 4096,
    "fps": 60,
    "memory": 8192,
    "music": [],
    "sounds": [],
    "sprites": ["./Assets/HelloWorldBanner.png"],
    "screen_width": 1280,
    "screen_height": 720,
    "main": "hello_world.sos",
    "output_file": "hello_world.sox",
    "working_directory": "./"
}
```

To draw the sprite "HelloWorldBanner.png", you could do this:

```s
store 0x100 0
store 0x101 0x0010001000050006
draw 0x101 0x100
```
Where the second argument of draw is the sprite, and it points to
a zero. The program will then look in the `sprites` list and 
choose the sprite at index 0.

## Function Reference

Most functions are meant to simplify generating constant values
with the right format for operations. These are:

### `music("path")`

Get the index of the music at the given path. `path` should match
exactly what is written in the program's configuration.

### `sound("path")`

Get the index of the sound at the given path. `path` should match
exactly what is written in the program's configuration.

### `sprite("path")`

Get the index of the sprite at the given path. `path` should match
exactly what is written in the program's configuration.

### `colour(r,g,b,a)`

Generate a single 64 bit integer containing the red, green, blue
and alpha components in a colour.

### `rect(x,y,width,height)`

Generate a single 64 bit integer representing the given rectangle,
whose top left coordinates are (x,y)

### `key_pressed(keycode)`

Generate a single 64 bit integer in the form of an event
for the given keycode being pressed. This keycode matches the Godot
keycodes.

### `key_released(keycode)`

Generate a single 64 bit integer in the form of an event
for the given keycode being released. This keycode matches the Godot
keycodes.

### `mouse_pressed(x,y,button)`

Generate a single 64 bit integer in the form of an event
for the given mouse button being pressed at the (x,y) position.
The mouse button matches the Godot button code.

### `mouse_released(x,y,button)`

Generate a single 64 bit integer in the form of an event
for the given mouse button being released at the (x,y) position.
The mouse button matches the Godot button code.

## Operations Reference

Almost all operations operate on addresses and use the values at the given
addresses rather than the address itself. For example:

```s
add 3 4
```

Does not equal `7`. It takes the value at address `3` and the value at address `4`, adds them, and puts the result in the special return address `-2`.

See the code for the machine code translation of each instruction.

Below the "return address" refers to `-2`.

### `nop`
Does nothing! You can use this to fill space I suppose.

### `store <addr> <value>`
Store value at the given address. This is your primary way to write values into memory.

### `copy <tgt addr> <src addr>`
Copy the value at `src addr` to `tgt addr`

### `copy_indirect <tgt addr> <src addr>`
Copy the value at the address stored in `src addr` to the address stored in `tgt addr`.

Note the difference between this and copy - both addresses are dereferenced first. For example:
```
store 1 1
store 2 2
store 3 3
store 4 4
add 1 2
store 5 RETURN
add 1 3
store 6 RETURN
copy_indirect 5 6
```

Just before copy indirect, the memory looks like this:

| 1 | 2 | 3 | 4 | 5 | 6 | ... | RETURN |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 2 | 3 | 4 | 3 | 4 | ... | 4 |

And just after the memory looks like this:

| 1 | 2 | 3 | 4 | 5 | 6 | ... | RETURN | 
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 2 | 4 | 4 | 3 | 4 | ... | 4 |

Spot the difference? `Memory[3] = 4`. copy_indirect in pseudo code would look
like this:

```python
# copy_indirect(src,tgt)

src_addr = Memory[src]
tgt_addr = Memory[tgt]

src_val = Memory[src_addr]

Memory[tgt_addr] = src_val
```

It may be your primary way to use calculated addresses in Simple OS.

### `add <left addr> <right addr>`
Add the value in the left address to the value in the right address and write the result to the return address.

### `mul <left addr> <right addr>`
Multiply the value in the left address by the value in the right address and write the result to the return address.

### `sub <left addr> <right addr>`
Subtract the value in the right address from the value in the left address and write the result to the return address. (left - right)

### `div <left addr> <right addr>`
Divide the value in the right address by the value in the left address, and write the result to the return address. (left / right)

### `mod <left addr> <right addr>`
Write the value in the left address modulo the value in the right address to the return address. (left % right)

### `neq <left addr> <right addr>`
If the value in the left address does not equal the value in the right address, write 1 to the return address. Otherwise, write 0 to the return address.

### `eq <left addr> <right addr>`
If the value in the left address equals the value in the right address, write 1 to the return address. Otherwise, write 0 to the return address.

### `lt <left addr> <right addr>`
If the value in the left address is less than the value in the right address, write 1 to the return address. Otherwise, write 0 to the return address.

### `gt <left addr> <right addr>`
If the value in the left address is greater than the value in the right address, write 1 to the return address. Otherwise, write 0 to the return address.

### `lte <left addr> <right addr>`
If the value in the left address is less than or equal to the value in the right address, write 1 to the return address. Otherwise, write 0 to the return address.

### `gte <left addr> <right addr>`
If the value in the left address is greater than or equal to the value in the right address, write 1 to the return address. Otherwise, write 0 to the return address.

### `jmp <cond addr> <tgt addr>`
If the value at `cond addr` is non-zero, jump to the address stored at `tgt addr` (not `tgt addr` itself). Otherwise do nothing.

### `xor <left addr> <right addr>`
Bitwise XOR the value in the left address with the value in the right address and write the result to the return address.

### `or <left addr> <right addr>`
Bitwise OR the value in the left address with the value in the right address and write the result to the return address.

### `and <left addr> <right addr>`
Bitwise AND the value in the left address with the value in the right address and write the result to the return address.

### `not <addr>`
Bitwise NOT the value in the address and write the result to the return address.

### `fill <rectangle addr> <colour addr>`
Fill the rectangle stored in rectangle address with the colour stored in the colour address.

### `draw <rectangle addr> <sprite index addr>`
Draw the sprite referenced by the sprite index stored at the sprite index address in the rectangle stored in the rectangle address.

The sprite is stretched to fill the rectangle.

### `clear <rectangle addr>`
Clear the screen with the "screen default colour" stored at address `-3`
over the rectangle stored in the rectangle address.

This is a shortcut to `fill` with the screen default colour

### `play_music <volume addr> <music index addr>`
Play the music referenced by the music index stored at the music index address
at the volume stored in the volume address.

The volume should be a number from 0 to 65535 and scales to decibels linearly.

Only one music track can play at once. Music will automatically loop 
back to the beginning of the track when it reaches the end.

### `stop_music`
Stop playing any currently playing music.

### `play_sound <volume addr> <sound index addr>`
Play the sound referenced by the sound index stored at the sound index address
at the volume stored in the volume address.

The volume should be a number from 0 to 65535 and scales to decibels linearly.

A sound will play once and then stop.

### `get_event`
Get an event from the event queue. This is either a mouse or keyboard event
and you can use the built-in functions to help test against this.

The encoded event is stored in the return address.

### `wait`
Pause execution until the next natural frame as dictated by the FPS setting

You should try to always include a wait in any event loop to avoid running
the CPU hot.

### `exit`
Exit the game. Immediately ends execution.

### `get_mouse`
Get the mouse location and store the coordinates in the return address.

### `get_ticks`
Get the number of milliseconds that have elapsed since the game started,
(meaning since this program started, not since Simple OS started).

### `random`
Generates a random 64 bit number and stores it in the return address.

## Machine Code Format

By "machine code" I am referring to the format of the `.sox` produced by the compiler.

**Warning:** Simple OS assumes it is being compiled and run on a little endian system. There is no support for big endian hosts.

The `.sox` file begins with a program header in this form:

8 bytes | 8 bytes | 8 bytes | 8 bytes | 8 bytes | 8 bytes |
--- | --- | --- | --- | --- | --- |
magic | view_width | view_height | fps | code_address | memory_size |

Below the header is the list of assets:

2 bytes | 6 bytes | x8 bytes | x8 bytes |
--- | --- | --- | --- |
type | length  | extension null terminates and right padded to 8 bytes | data right padded to 8 bytes |

The data there is the raw bytes of the resource (not compressed).

Once all the assets are written, a special `NO_ASSET` entry is written
whose type is `0`, and length is `0`, and extension is all `0s`.

Then all the bytes up to this point are right padded to align to a `16 byte` boundary. This ensures the code begins at a `16 byte boundary`.

Finally you have the code itself at the bottom of the file. Every instruction is exactly 16 bytes in this form:

2 bytes | 6 bytes | 8 bytes |
--- | --- | --- |
op type | addr | addr / val |

Almost all instructions operate purely on addresses. Notably `store` takes
a value to store in memory.
Note that since the first argument is only 6 bytes, you cannot use addresses beyond `2^48`... hopefully not a problem!!

## Compiler

The compiler for the Simple OS assembly language lives inside the VSCodeExtension folder.
It can be run independently through `main.ts` but the recommended way is to install the VSCode Simple OS
extension and build it with the command it provides.

See the VSCode [README.md](./VSCodeExtension/README.md) for details
on how to use the extension.