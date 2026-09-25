import { AVATAR_ALLOWED_MIME_TYPES, AVATAR_MAX_BYTES, IMPORT_MAX_BYTES } from './operations.js';

/**
 * What an uploaded file must look like, stated once for both sides.
 *
 * The application checks a file before sending it so the user is told at once;
 * the mock API checks it again on arrival because the client's check is a
 * convenience and the server's is the rule. Both run **this** function, so the
 * two can never disagree about what "a valid avatar" means - a client that
 * accepted `.gif` while the server refused it would produce an error the user
 * could not have avoided.
 *
 * What this function can know is limited to what a client can claim: a name, a
 * declared type and a size. None of the three is proof. The name is typed by a
 * person, the type is guessed by the browser from that name, and a size says
 * nothing about content. The server therefore adds a check this function
 * cannot make - it reads the first bytes of the file and compares them with the
 * declared type (`apps/mock-api/src/http/file-signature.ts`). See
 * docs/security.md, "File upload".
 */

export interface FilePolicy {
  /** Lower-case, with the leading dot. */
  readonly extensions: readonly string[];
  readonly mimeTypes: readonly string[];
  readonly maxBytes: number;
}

/** The facts about a file that a browser's `File` and a multipart part both carry. */
export interface FileFacts {
  readonly name: string;
  readonly type: string;
  readonly size: number;
}

/**
 * Why a file was refused. A code, not a sentence: the client translates it and
 * the server writes its own developer-facing message.
 */
export type FileRejection = 'EMPTY' | 'TOO_LARGE' | 'EXTENSION' | 'MIME_TYPE';

export const AVATAR_ALLOWED_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp'] as const;

export const AVATAR_FILE_POLICY: FilePolicy = {
  extensions: AVATAR_ALLOWED_EXTENSIONS,
  mimeTypes: AVATAR_ALLOWED_MIME_TYPES,
  maxBytes: AVATAR_MAX_BYTES,
};

/**
 * CSV has no single MIME type in practice: browsers on Windows report a `.csv`
 * as `application/vnd.ms-excel`, because that is what the registry associates
 * with the extension. Refusing it would refuse most real users.
 */
export const IMPORT_ALLOWED_MIME_TYPES = ['text/csv', 'application/vnd.ms-excel'] as const;
export const IMPORT_ALLOWED_EXTENSIONS = ['.csv'] as const;

export const IMPORT_FILE_POLICY: FilePolicy = {
  extensions: IMPORT_ALLOWED_EXTENSIONS,
  mimeTypes: IMPORT_ALLOWED_MIME_TYPES,
  maxBytes: IMPORT_MAX_BYTES,
};

/**
 * The extension as the policy compares it: lower-case, from the **last** dot.
 *
 * The last dot is the one that matters, because it is the one an operating
 * system and a web server act on - `invoice.pdf.exe` is an executable. A name
 * with no dot, or only a leading one (`.bashrc`), has no extension.
 */
export function fileExtensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot).toLowerCase() : '';
}

/**
 * The first rule a file breaks, or `null` if it breaks none.
 *
 * Checked in order of how cheaply a user can fix the problem, which is also
 * the order a user would want to be told about it.
 */
export function checkFile(file: FileFacts, policy: FilePolicy): FileRejection | null {
  if (file.size <= 0) {
    return 'EMPTY';
  }
  if (file.size > policy.maxBytes) {
    return 'TOO_LARGE';
  }
  if (!policy.extensions.includes(fileExtensionOf(file.name))) {
    return 'EXTENSION';
  }
  // A declared type can carry parameters (`text/csv; charset=utf-8`), which
  // say nothing about what kind of file it is.
  const declared = file.type.split(';')[0].trim().toLowerCase();
  if (!policy.mimeTypes.includes(declared)) {
    return 'MIME_TYPE';
  }
  return null;
}
