/**
 * We assume we are on a little endian system
 */

import { readFileSync } from "fs";

/**
 * Convert the 64 bit number in the big integer to bytes
 * @param number the big integer, assumed to represent a 64 bit unsigned number
 */
export function bigint_to_bytes64(big_number: bigint | number): Uint8Array
{
    var non_negative_big_number = BigInt.asUintN(64, BigInt(big_number));
    var bytes = new Uint8Array(8);
    for (var i = 0; i < 8; i++)
    {
        bytes[i] = Number(non_negative_big_number & 0xFFn);
        non_negative_big_number = non_negative_big_number / 0xFFn;
    }
    return bytes;
}

/**
 * Convert the 16 bit number in the big integer to bytes
 * @param number the big integer, assumed to represent a 16 bit unsigned number
 */
export function bigint_to_bytes16(big_number: bigint | number): Uint8Array
{
    var non_negative_big_number = BigInt.asUintN(16, BigInt(big_number));
    var bytes = new Uint8Array(2);
    for (var i = 0; i < 2; i++)
    {
        bytes[i] = Number(non_negative_big_number & 0xFFn);
        non_negative_big_number = non_negative_big_number / 0xFFn;
    }
    return bytes;
}

/**
 * Convert the 48 bit number in the big integer to bytes
 * @param number the big integer, assumed to represent a 48 bit unsigned number
 */
export function bigint_to_bytes48(big_number: bigint | number): Uint8Array
{
    var non_negative_big_number = BigInt.asUintN(48, BigInt(big_number));
    var bytes = new Uint8Array(6);
    for (var i = 0; i < 6; i++)
    {
        bytes[i] = Number(non_negative_big_number & 0xFFn);
        non_negative_big_number = non_negative_big_number / 0xFFn;
    }
    return bytes;
}


/**
 * Convert a file to a byte array of its contents
 * This is a pretty slow function...
 * @param path the file we want to convert to bytes
 */
export function file_to_bytes(path: string): Uint8Array
{
    var file_data = readFileSync(path).toString("hex");
    var byte_array = new Uint8Array(file_data.length / 2);
    for (var i = 0; i < file_data.length; i+=2)
    {
        byte_array[i / 2] = Number("0x" + file_data[i] + "" + file_data[i+1]);
    }
    return byte_array;
}

/**
 * Convert a string to a byte array, with a null terminator
 * @param text the text to convert
 * @returns The UTF-8 byte representation of the string
 */
export function string_to_bytes(text: string): Uint8Array
{
    var raw_bytes = new Uint8Array(Buffer.from(text, "utf-8"));
    return concat_bytes([raw_bytes, new Uint8Array([0x00])]);
}

/**
 * Pad an array of bytes up to some alignment given in "padding"
 * @param bytes the original bytes
 * @param padding the bytes with padding applied to the right side. All padding is zero
 * @returns the new padded byte array. May be exactly what was passed in
 */
export function right_pad_bytes(bytes: Uint8Array, padding: number): Uint8Array
{
    if (bytes.length % padding == 0)
    {
        return bytes;
    }
    var padding_length = padding - (bytes.length % padding);
    var padding_bytes = new Uint8Array(padding_length);
    for (var i = 0; i < padding_length; i++)
    {
        padding_bytes[i] = 0;
    }
    return concat_bytes([bytes, padding_bytes]);
}

/**
 * Combine a list of byte arrays into a new single byte array
 * @param byte_arrays the individual byte arrays to concatenate together
 * @returns a new byte array with all the bytes in order from the individual arrays
 */
export function concat_bytes(byte_arrays = Uint8Array[])
{
    // Get the total length of all arrays.
    var total_length = 0;
    byte_arrays.forEach(array => {
        total_length += array.length;
    });

    // Create a new array with total length and merge all source arrays.
    var merged_array = new Uint8Array(total_length);
    var offset = 0;
    byte_arrays.forEach(array => {
        merged_array.set(array, offset);
        offset += array.length;
    });

    return merged_array;
}
