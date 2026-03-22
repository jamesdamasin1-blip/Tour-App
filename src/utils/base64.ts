import { encode, decode } from 'base-64';

/**
 * UTF-8-safe base64 encoding/decoding.
 * The base-64 library (and btoa/atob) only handle Latin1 characters.
 * These wrappers first convert to/from UTF-8 byte strings so that
 * emoji, accented characters, and other non-Latin1 text work safely.
 */

export function base64Encode(str: string): string {
    return encode(unescape(encodeURIComponent(str)));
}

export function base64Decode(b64: string): string {
    return decodeURIComponent(escape(decode(b64)));
}
