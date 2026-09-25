/**
 * What a file's first bytes say it is.
 *
 * The one upload check a client cannot make for the server. A file's name is
 * typed by a person and its declared type is the browser's guess from that
 * name, so both are claims; the bytes are the file. A PNG always begins with
 * the same eight bytes, a JPEG with three, a WebP with a RIFF header naming
 * `WEBP` - and an HTML page renamed to `avatar.png` begins with none of them.
 *
 * This is still not full content inspection. A file can begin with a valid
 * signature and carry anything after it; a real service would decode the image
 * and re-encode it, which discards whatever was hidden in it. That step is
 * stated in docs/security.md as belonging to a production backend rather than
 * implied to be done here.
 */

export type DetectedImageType = 'image/png' | 'image/jpeg' | 'image/webp';

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff];
const RIFF = [0x52, 0x49, 0x46, 0x46];
const WEBP = [0x57, 0x45, 0x42, 0x50];

function startsWith(bytes: Uint8Array, signature: readonly number[], offset = 0): boolean {
  if (bytes.length < offset + signature.length) {
    return false;
  }
  return signature.every((byte, index) => bytes[offset + index] === byte);
}

export function detectImageType(bytes: Uint8Array): DetectedImageType | null {
  if (startsWith(bytes, PNG_SIGNATURE)) {
    return 'image/png';
  }
  if (startsWith(bytes, JPEG_SIGNATURE)) {
    return 'image/jpeg';
  }
  // RIFF, then four bytes of length, then the format.
  if (startsWith(bytes, RIFF) && startsWith(bytes, WEBP, 8)) {
    return 'image/webp';
  }
  return null;
}
