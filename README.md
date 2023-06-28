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
* `Tutorial` - loaded automatically by Godot when you are start the game.

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
    "working_directory": "./"
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
  * There is no font support (yet), so images are probably the easiest way to convey textual information.
* `screen_width` / `screen_height`: the resolution of the game
  * You can use resolutions higher than the game's own, but the viewport will approximate what is drawn.

If you stick to the file naming convention, these settings can be ignored. Otherwise:
* `main` - the entry point of the program
* `output_file` - the name of the file to be produced by the compiler. Simple OS will expect the `.sox` extension.
* `working_directory` - when resolving includes or assets, this is added to the front of relative paths.
  * If relative itself, then the workspace folder is applied to the front of it.

Without settings, relative paths are resolved relative to the workspace directory. This makes it necessary to open a `Folder` in VSCode, not the individual files.

There is a [schema here](./VSCodeExtension/simple-os-config-schema.json) for the configuration file that the VSCode extension
will match to all `.sos.json` files that can help you to fill it in.

## Assembly Reference



## Machine Code Format

By "machine code" I am referring to the format of the `.sox` produced by the compiler.

**Warning:** Simple OS assumes it is being compiled and run on a little endian system. There is no support for big endian hosts.

The `.sox` file begins with a program header in this form:

8 bytes -> | 8 bytes -> |
--- | --- |
magic | view_width |
view_height | fps |
code_address | memory_size |

The table should be read left to right, top to bottom, as should the following tables.

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

## Memory Layout

Code and data are stored in flat memory. There is no concept of a `heap` or `stack` - if you want these, it is up to you to implement them!

Memory is also fixed at program start, so I would request more than you need.

Addresses begin at `0` and continue up to the amount of memory your program
configuration requested.

All memory locations store 64 bit numeric values. This means for the majority of programs arithmetic is trivial as your numbers should fit in one memory address.

In operations `-1` is taken to be the last address of memory, `-2` just before that and so on.

The only special locations are:
* `-1` - the instruction pointer is stored here.
  * This is updated to point to the next instruction to execute by certain commands, and increments by default.
* `-2` - operations that return a value write it here.
* `-3` - the screen default colour if `clear` is used
* `-4` - the FPS. Note this is not actually used right now.
* `-5` - frame delta. The amount of time that passed since the last frame. 
  * You can use `get_ticks` to work this out as well which is more reliable in case your frame times out..!

I would avoid changing the above addresses unless you are sure you know
what you are doing! The rest is entirely free to use however you want.

## Compiler

The compiler for the Simple OS assembly language lives inside the VSCodeExtension folder.
It can be run independently through `main.ts` but the recommended way is to install the VSCode Simple OS
extension and build it with the command it provides.

See the VSCode [README.md](./VSCodeExtension/README.md) for details
on how to use the extension.