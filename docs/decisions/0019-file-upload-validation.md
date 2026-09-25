# ADR-0019 — One file policy for both sides, and a content check only the server makes

**Status:** Accepted
**Date:** 2026-09-25
**Phase:** Phase 3

## Problem

The Phase 3 prompt asks for uploads to be validated by extension, MIME type and
size, with the mock backend validating independently and client validation never
treated as the final boundary. What existed:

- the avatar endpoint checked the **declared** MIME type only - debt row 7;
- the CSV import checked nothing but size;
- a file over the size limit produced a `MulterError` that the error handler did
  not recognise, so the client's oversized file was answered with **500** - the
  server blaming itself (found by a Phase 3 test, fixed here);
- there is no upload UI yet. Avatar upload and CSV import screens are Phase 4.

## Options considered

### Option A — Each side writes its own rules

- Pros: no shared code.
- Cons: they drift. A client that accepts `.gif` while the server refuses it
  produces an error the user could not have avoided.

### Option B — One rule in `@ecm/contracts`, run by both sides (chosen)

`checkFile(facts, policy)` over `{ name, type, size }` - the three facts a
browser `File` and a multipart part both carry - with `AVATAR_FILE_POLICY` and
`IMPORT_FILE_POLICY`.

- Pros: one definition of "valid", exactly as for every other API shape here.
- Cons: none worth recording; the function is small and pure.

## Decision

**Option B**, plus the check only a server can be trusted to make.

| Check                                                         | Client (Phase 4 UI) | Mock API                             |
| ------------------------------------------------------------- | ------------------- | ------------------------------------ |
| empty file                                                    | `checkFile`         | `checkFile`                          |
| size                                                          | `checkFile`         | multer limit + `checkFile` → **413** |
| extension, by the **last** dot                                | `checkFile`         | `checkFile` → **415**                |
| declared MIME type allowlist                                  | `checkFile`         | `checkFile` → **415**                |
| first bytes match declared type (PNG / JPEG / WebP signature) | -                   | `detectImageType` → **415**          |

The extension and type are checked in multer's `fileFilter`, before the body is
buffered, and authorization runs before either - a refused user cannot make the
server read five megabytes on their behalf. SVG is not on the avatar allowlist:
it is an image to a person and a document with script to a browser.

Output handling for files is fixed at the same time: the CSV export prefixes
any cell a spreadsheet would evaluate (`=`, `+`, `-`, `@`, tab, CR) with an
apostrophe. A customer named `=HYPERLINK(…)` is a string to this server and a
live formula to Excel.

## Reason

Name, declared type and size are all claims the client makes; the bytes are the
file. The signature check is what turns an HTML page renamed `avatar.png` and
sent as `image/png` - which passes every other check - into a 415. Putting the
three claim checks in the contract and the byte check only on the server draws
the frontend/backend line exactly where the prompt asks for it.

## Consequences

- Debt row 7 is paid as far as a signature check goes. What is still not done
  is stated in `docs/security.md`: a production service would decode and
  re-encode images (which discards anything hidden after a valid header), scan
  for malware, and serve user content from a separate origin.
- `checkFile` has no client caller until Phase 4 builds the upload screens.
  The prompt required the rule now; the caller is named and one phase away.
- A phone number beginning with `+` is exported with a leading apostrophe. The
  OWASP guidance, accepted over guessing which text is safe.

## Revisit when

- another file type is accepted - it needs a signature, or a statement that it
  has none (CSV has none; it is parsed, and parse failures are a 400);
- uploads move to object storage with direct browser uploads, where the server
  sees the bytes only after the fact.
