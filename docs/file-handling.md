# File handling

Avatar upload, CSV import and CSV export: what the user sees, what is validated
where, and how bytes move. Decisions:
[ADR-0019](decisions/0019-file-upload-validation.md) (validation),
[ADR-0021](decisions/0021-upload-progress-transport.md) (transport),
[ADR-0024](decisions/0024-two-phase-import.md) (import).

## Validation happens twice, by the same rule

`checkFile(facts, policy)` in `@ecm/contracts` checks emptiness, size, extension
(by the last dot) and declared MIME type. The browser runs it so the user is told
at once and nothing doomed is sent; the server runs it again because the client's
check is a convenience. The server also checks the avatar's **first bytes**
against the declared type - an HTML file named `avatar.png` and sent as
`image/png` passes every client check and is refused with 415.

| Policy | Extensions            | MIME types                                   | Size |
| ------ | --------------------- | -------------------------------------------- | ---- |
| avatar | .png .jpg .jpeg .webp | image/png, image/jpeg, image/webp            | 2 MB |
| import | .csv                  | text/csv, application/vnd.ms-excel (Windows) | 5 MB |

The `accept` attribute on the file input narrows the picker. It is a convenience
too: it does not stop a drop, and the user can switch the picker to "All files".

## Choosing a file

`app-file-drop` is a real `<input type="file">` inside a `<label>`, with drag and
drop layered on top. Keyboard and screen-reader users get a native control;
pointer users can also drop. It selects - it does not validate, upload or preview.

## Avatar upload

```text
idle ─choose─▶ ready (preview) ─upload─▶ uploading (progress %) ─done─▶ idle + toast
  │ invalid: message, nothing sent          │ cancel ─▶ ready (XHR aborted)
                                            └ fail ───▶ failed ─retry─▶ uploading
```

- **Preview** is an object URL for the chosen file, revoked when replaced, when
  the upload finishes and when the component is destroyed.
- **Progress** is real: the request travels on XHR because `fetch` has no upload
  progress (ADR-0021).
- **Cancel** unsubscribes, which aborts the XHR; the E2E suite observes the
  request fail in the browser.
- **Failure** shows the error taxonomy's message, never the server's; retry
  re-sends the same file.
- **Not blocking**: the state is the component's own; the rest of the page -
  refresh, edit, audit - stays usable, and leaving the page cancels the upload.
- On success the record is refetched, because the upload moved its version.

## CSV import

`/customers/import`, for users with `CUSTOMER_IMPORT`:

1. **Choose** - `checkFile` with the import policy.
2. **Upload and parse** - `POST /customers/import?mode=preview`, with progress.
   Nothing is written.
3. **Preview** - totals (will import / will be skipped), missing required columns
   (import blocked), ignored columns, the first 20 rows with an outcome each,
   and every error by row, column and code.
4. **Confirm** - "Import N customers".
5. **Import** - the same file, `?mode=commit`, with upload progress, then
   "Importing" while the server works.
6. **Result** - imported and skipped counts, the skipped rows, and "Download the
   skipped rows" as `import-errors.csv` (row, column, code), built in the browser.

Partial success is a result, not an error. Row numbers are the spreadsheet's
(header = row 1). Every upload can be cancelled; cancel during the import goes
back to the preview, and nothing was imported.

## CSV export

"Export CSV" on the list, for users with `CUSTOMER_EXPORT`, exports **every**
customer the current filters match. Download progress is shown when the size is
known; the list stays usable while it downloads; a failure is a toast; the file
is handed to the browser under the server's filename and its object URL revoked.

## Output handling

A CSV is opened in a spreadsheet, which evaluates cells beginning with `=`, `+`,
`-`, `@`, tab or CR. Both CSVs this system produces - the export (server) and the
import error report (browser) - prefix such cells with an apostrophe.

## What is not done

- Images are signature-checked, not decoded and re-encoded; no malware scan; user
  content is not served from a separate origin (`docs/security.md`).
- The import file is uploaded twice (preview, then import) - acceptable at 5 MB;
  ADR-0024 says when to revisit.
- No resumable or chunked uploads.
