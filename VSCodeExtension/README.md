# Simple OS

Simple OS is a super simplified operating system through
which you can write programs to be executed by a Godot game
also in this repo.

See this repository's top level README for more details
about the language.

## Getting Started

Begin by creating a configuration file that looks like this:
```json
{
    "code_address": 4096,
    "memory": 8192,
    "fps": 60,
    "screen_height": 720,
    "screen_width": 1280,
    "music": [],
    "sounds": [],
    "sprites": []
}
```
Name it `<my_program>.sos.json` - the ".sos.json" ensures
the compiler can derive the out file and the main file
by convention.

Then create `<my_program>.sos` and start writing your program!

Use The `Compile Simple OS Program` command to compile
the program. Errors will be printed to its own output
channel called `Simple OS Compiler`.

The extension supports:

* Syntax highlighting
* Definition click through
* Signature support
* File analysis

Use the Godot game in this rpeo to run your programs.

Have fun!

## Building

`Ctrl-Shift-B` to build and watch for changes. Due to the way
the client and server share code, this is not perfect
for the client...!

Package the vsix by installing `vsce` and run `vsce package`.
