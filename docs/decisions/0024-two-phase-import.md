# ADR-0024 — CSV import is a preview request and an import request, with nothing held between them

**Status:** Accepted
**Date:** 2026-09-25
**Phase:** Phase 4

## Problem

The import flow is: select → validate file → upload → parse → preview →
validate rows → confirm → import → progress → result. Phase 0.5's endpoint did
all of it in one request, so there was no moment to show a preview and ask.

## Options considered

### A — Parse and validate in the browser, then upload once

- Pros: no second request.
- Cons: the browser cannot know which emails already exist, so the preview
  would promise rows the import then refuses. A preview that lies about
  duplicates is worse than none.

### B — Server-side staging: upload once, get an import id, confirm the id

- Pros: the file crosses the network once.
- Cons: the server holds a pending import per user until it is confirmed or
  expires - state, expiry and cleanup, for a flow the user may simply abandon.

### C — The same file twice: `?mode=preview`, then `?mode=commit` (chosen)

- Pros: nothing is held on the server; an abandoned preview costs nothing. The
  preview and the import run the **same** validation function, so the preview
  is a promise the import keeps unless the data changed in between.
- Cons: the file is uploaded twice. At the 5 MB limit that is acceptable.

## Decision

Option C. The preview validates every row against the contract, against the
customers that exist, and against earlier rows of the same file - the check
a client-side preview cannot make. It reports missing required columns (import
blocked), ignored columns (a note), per-row outcomes for the first rows, and
every error by row, column and code.

The result is per row: successes counted, failures listed by the row number the
user's spreadsheet shows, and downloadable as `import-errors.csv` built in the
browser from the result. The server's per-row `message` is developer prose and
is never rendered; the code is translated.

## Consequences

- `importPreviewSchema` and `importModeSchema` in `@ecm/contracts`; the mode
  defaults to `commit`, so the Phase 0.5 behaviour of the endpoint is unchanged.
- Progress is real for the upload and honest afterwards: once every byte is
  sent, the page says "Importing" without a percentage while the server works.

## Revisit when

- files grow past what two uploads cost comfortably - then staging (B);
- imports become long-running server jobs - then progress comes from the
  server, over the realtime stream.
