import { randomUUID } from 'node:crypto';
import { parse as parseCsv } from 'csv-parse/sync';
import {
  AVATAR_FILE_POLICY,
  IMPORT_FILE_POLICY,
  IMPORT_MAX_ROWS,
  IMPORT_OPTIONAL_COLUMNS,
  IMPORT_PREVIEW_ROWS,
  IMPORT_REQUIRED_COLUMNS,
  importModeSchema,
  type CreateCustomerRequest,
  type ImportPreview,
  type UserId,
  checkFile,
  createCustomerRequestSchema,
  customerListQuerySchema,
  type FilePolicy,
  type ImportResult,
  type ImportRowError,
  type Instant,
} from '@ecm/contracts';
import { Router, type RequestHandler } from 'express';
import multer from 'multer';
import type { MockStore } from '../domain/store.ts';
import { ApiError, badRequest, notFound } from '../http/api-error.ts';
import { detectImageType } from '../http/file-signature.ts';
import { pathParam } from '../http/params.ts';
import { parseOrThrow } from '../http/validate.ts';
import { currentUser, requireAuth, requireCsrf, requirePermission } from '../middleware/auth.ts';
import { hasScenario } from '../middleware/fault-injection.ts';

/**
 * File endpoints: avatar upload, CSV import, CSV export.
 *
 * Uploads are held in memory. Writing to disk would mean a cleanup story, a
 * path-traversal surface and files surviving a restart - all real concerns, and
 * none of them what this server exists to teach.
 *
 * **Client-side validation is repeated here, on purpose.** The application
 * checks the type and size so the user is told immediately; this checks them
 * again because the client's check is a convenience and this one is the rule.
 * Both run the same `checkFile` from `@ecm/contracts`, so they cannot disagree
 * about what is allowed - and this side adds the one check the client cannot
 * be trusted with: the avatar's first bytes must match the type it claims.
 */

/** Errors returned per import; beyond this the response is the problem. */
const MAX_REPORTED_IMPORT_ERRORS = 100;

export function fileRoutes(store: MockStore): Router {
  const router = Router();

  const avatarUpload = singleFile(AVATAR_FILE_POLICY);
  const csvUpload = singleFile(IMPORT_FILE_POLICY);

  router.post(
    '/:id/avatar',
    requireAuth,
    requireCsrf,
    requirePermission('CUSTOMER_UPDATE'),
    avatarUpload,
    (req, res) => {
      const file = requireFile(req.file, AVATAR_FILE_POLICY);

      // The declared type is the client's claim; the first bytes are the file.
      // An HTML page renamed to avatar.png and sent as image/png passes every
      // check above and fails this one.
      const detected = detectImageType(file.buffer);
      if (detected !== file.mimetype) {
        throw new ApiError(
          'UNSUPPORTED_MEDIA_TYPE',
          `The file content does not match its declared type ${file.mimetype}.`,
        );
      }

      const url = store.setAvatar(
        pathParam(req, 'id'),
        file.buffer,
        file.mimetype,
        currentUser(req).id,
      );
      res.status(201).json({
        customerId: pathParam(req, 'id'),
        avatarUrl: url,
        sizeBytes: file.size,
        contentType: file.mimetype,
      });
    },
  );

  router.get('/:id/avatar', requireAuth, requirePermission('CUSTOMER_READ'), (req, res) => {
    const avatar = store.getAvatar(pathParam(req, 'id'));
    if (!avatar) {
      throw notFound('Avatar');
    }
    res.setHeader('Content-Type', avatar.contentType);
    // Uploaded content is never rendered as a document, whatever its type says.
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.status(200).send(avatar.data);
  });

  router.post(
    '/import',
    requireAuth,
    requireCsrf,
    requirePermission('CUSTOMER_IMPORT'),
    csvUpload,
    (req, res) => {
      const file = requireFile(req.file, IMPORT_FILE_POLICY);
      const mode = parseOrThrow(importModeSchema, req.query['mode'] ?? 'commit', 'import mode');
      const injectFailures = hasScenario(req, 'import-partial-failure');

      // `mode=preview` validates every row and writes nothing; the default
      // imports. Two requests with the same file, rather than a server-side
      // pending import to confirm: nothing is held on the server between
      // them, so an abandoned preview costs nothing and expires nothing.
      res
        .status(200)
        .json(
          mode === 'preview'
            ? previewCsv(store, file.buffer, injectFailures)
            : importCsv(store, file.buffer, currentUser(req).id, injectFailures),
        );
    },
  );

  router.get('/export', requireAuth, requirePermission('CUSTOMER_EXPORT'), (req, res) => {
    // The export honours the same filters as the list, so "export what I am
    // looking at" is one request rather than a second, divergent query API.
    const query = parseOrThrow(
      customerListQuerySchema,
      { ...req.query, page: 1, size: 1 },
      'export query',
    );
    const all = store.list({ ...query, page: 1, size: Number.MAX_SAFE_INTEGER });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="customers.csv"');

    const header = 'customerCode,fullName,email,phone,status,gender,createdAt\n';
    const rows = all.items
      .map((customer) =>
        [
          customer.customerCode,
          // Every value a user typed goes through csvCell. A phone number is
          // free text, and `+84...` gains an apostrophe - the OWASP guidance,
          // accepted because the alternative is guessing which text is safe.
          csvCell(customer.fullName),
          csvCell(customer.email),
          csvCell(customer.phone ?? ''),
          customer.status,
          customer.gender,
          customer.createdAt,
        ].join(','),
      )
      .join('\n');

    res.status(200).send(header + rows + '\n');
  });

  return router;
}

/**
 * One multipart file, held in memory, with the policy's name and type rules
 * applied before a byte of it is buffered.
 *
 * Multer reports its own failures as `MulterError`, which the error handler
 * does not know and would answer with a 500. The two a client can cause are
 * translated here into the envelope's codes - a file over the limit is the
 * client's 413, not the server's fault.
 */
function singleFile(policy: FilePolicy): RequestHandler {
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: policy.maxBytes, files: 1 },
    fileFilter: (_req, file, callback) => {
      // The size is not known yet - the body is still streaming - so the size
      // rule is left to the limit above and to `requireFile`. A size of 1 is
      // a stand-in that satisfies it.
      const rejection = checkFile(
        { name: file.originalname, type: file.mimetype, size: 1 },
        policy,
      );
      if (rejection) {
        callback(rejectionError(rejection, file.originalname, file.mimetype));
        return;
      }
      callback(null, true);
    },
  }).single('file');

  return (req, res, next) => {
    upload(req, res, (error: unknown) => {
      if (error instanceof multer.MulterError) {
        next(
          error.code === 'LIMIT_FILE_SIZE'
            ? new ApiError('PAYLOAD_TOO_LARGE', `A file may be at most ${policy.maxBytes} bytes.`)
            : badRequest(`Upload rejected: ${error.code}.`),
        );
        return;
      }
      next(error);
    });
  };
}

/** The uploaded file, checked against the whole policy now that its size is known. */
function requireFile(file: Express.Multer.File | undefined, policy: FilePolicy) {
  if (!file) {
    throw badRequest('Expected a multipart field named "file".');
  }
  const rejection = checkFile(
    { name: file.originalname, type: file.mimetype, size: file.size },
    policy,
  );
  if (rejection) {
    throw rejectionError(rejection, file.originalname, file.mimetype);
  }
  return file;
}

function rejectionError(
  rejection: NonNullable<ReturnType<typeof checkFile>>,
  name: string,
  type: string,
): ApiError {
  switch (rejection) {
    case 'TOO_LARGE':
      return new ApiError('PAYLOAD_TOO_LARGE', 'The file is larger than allowed.');
    case 'EMPTY':
      return badRequest('The file is empty.');
    case 'EXTENSION':
      return new ApiError('UNSUPPORTED_MEDIA_TYPE', `Files named like "${name}" are not accepted.`);
    case 'MIME_TYPE':
      return new ApiError('UNSUPPORTED_MEDIA_TYPE', `Unsupported file type ${type}.`);
  }
}

/**
 * One CSV cell, safe to open in a spreadsheet.
 *
 * Two different problems. Quoting keeps a comma or a newline inside the cell
 * instead of breaking the row. The leading apostrophe defends against formula
 * injection: a customer named `=HYPERLINK("https://evil.test", "Click")` is a
 * string to this server and a live formula to Excel the moment someone opens
 * the export. Any value a user typed can start with `=`, `+`, `-`, `@`, a tab
 * or a carriage return, and each of those makes a spreadsheet evaluate it.
 */
function csvCell(value: string): string {
  const neutralised = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\n\r]/.test(neutralised) ? `"${neutralised.replace(/"/g, '""')}"` : neutralised;
}

/** One data row, after reading and validating, before anything is written. */
interface RowOutcome {
  readonly row: number;
  readonly record: Record<string, string>;
  readonly input: CreateCustomerRequest | null;
  readonly errors: readonly ImportRowError[];
}

interface ReadCsv {
  readonly records: Record<string, string>[];
  readonly columns: readonly string[];
}

function readCsv(content: Buffer): ReadCsv {
  let columns: string[] = [];
  let records: Record<string, string>[];
  try {
    records = parseCsv(content, {
      columns: (header: string[]) => (columns = header.map((column) => column.trim())),
      skip_empty_lines: true,
      trim: true,
      bom: true,
    }) as Record<string, string>[];
  } catch (error) {
    throw badRequest(`The file is not valid CSV: ${(error as Error).message}`);
  }

  if (records.length > IMPORT_MAX_ROWS) {
    throw new ApiError('PAYLOAD_TOO_LARGE', `At most ${IMPORT_MAX_ROWS} rows per import.`);
  }
  return { records, columns };
}

/**
 * Validates every row without writing anything.
 *
 * The same function backs the preview and the import, which is what makes the
 * preview a promise the import keeps: a row the preview called valid fails
 * the import only if the world changed in between - someone created a
 * customer with that email while the user was reading the preview.
 *
 * An email is checked against the customers that exist **and** against the
 * rows above it in the same file. The second check is the one people forget,
 * and it is why a preview cannot be computed in the browser.
 */
function validateRows(
  store: MockStore,
  records: readonly Record<string, string>[],
  injectFailures: boolean,
): RowOutcome[] {
  const seenEmails = new Set<string>();

  return records.map((record, index) => {
    // Row 1 is the header, so a spreadsheet's row number is index + 2. Getting
    // this off by one makes every error message point at the wrong line.
    const row = index + 2;

    if (injectFailures && index % 3 === 2) {
      return {
        row,
        record,
        input: null,
        errors: [
          { row, column: null, code: 'INVALID_FORMAT', message: 'Injected import failure.' },
        ],
      };
    }

    const parsed = createCustomerRequestSchema.safeParse({
      fullName: record['fullName'],
      email: record['email'],
      phone: record['phone'] || null,
      dateOfBirth: record['dateOfBirth'] || null,
      gender: record['gender'] || undefined,
      status: record['status'] || undefined,
      tags: record['tags'] ? record['tags'].split('|').filter(Boolean) : undefined,
    });

    if (!parsed.success) {
      return {
        row,
        record,
        input: null,
        errors: parsed.error.issues.map((issue): ImportRowError => ({
          row,
          column: issue.path[0] ? String(issue.path[0]) : null,
          code: issue.code === 'invalid_type' ? 'REQUIRED' : 'INVALID_FORMAT',
          message: issue.message,
        })),
      };
    }

    const email = parsed.data.email.toLowerCase();
    if (store.hasEmail(email) || seenEmails.has(email)) {
      return {
        row,
        record,
        input: null,
        errors: [
          {
            row,
            column: 'email',
            code: 'DUPLICATE_EMAIL',
            message: `A customer with email ${parsed.data.email} already exists.`,
          },
        ],
      };
    }
    seenEmails.add(email);
    return { row, record, input: parsed.data, errors: [] };
  });
}

function previewCsv(store: MockStore, content: Buffer, injectFailures: boolean): ImportPreview {
  const { records, columns } = readCsv(content);
  const outcomes = validateRows(store, records, injectFailures);
  const known = new Set<string>([...IMPORT_REQUIRED_COLUMNS, ...IMPORT_OPTIONAL_COLUMNS]);

  const errors: ImportRowError[] = [];
  for (const outcome of outcomes) {
    outcome.errors.forEach((error) => pushError(errors, error));
  }
  const invalidRows = outcomes.filter((outcome) => outcome.input === null).length;

  return {
    totalRows: records.length,
    validRows: records.length - invalidRows,
    invalidRows,
    missingColumns: IMPORT_REQUIRED_COLUMNS.filter((column) => !columns.includes(column)),
    unknownColumns: columns.filter((column) => !known.has(column)),
    rows: outcomes.slice(0, IMPORT_PREVIEW_ROWS).map((outcome) => ({
      row: outcome.row,
      fullName: outcome.record['fullName'] ?? '',
      email: outcome.record['email'] ?? '',
      status: outcome.record['status'] ?? '',
      valid: outcome.input !== null,
    })),
    errors,
    errorsTruncated: errors.length >= MAX_REPORTED_IMPORT_ERRORS,
  };
}

function importCsv(
  store: MockStore,
  content: Buffer,
  actorId: UserId,
  injectFailures: boolean,
): ImportResult {
  const { records } = readCsv(content);
  const errors: ImportRowError[] = [];
  let succeeded = 0;

  for (const outcome of validateRows(store, records, injectFailures)) {
    if (!outcome.input) {
      outcome.errors.forEach((error) => pushError(errors, error));
      continue;
    }
    try {
      store.create(outcome.input, actorId);
      succeeded += 1;
    } catch (error) {
      // Validation passed a moment ago; this is the world changing in between.
      pushError(errors, {
        row: outcome.row,
        column: 'email',
        code:
          error instanceof ApiError && error.code === 'CONFLICT'
            ? 'DUPLICATE_EMAIL'
            : 'INVALID_FORMAT',
        message: error instanceof Error ? error.message : 'Unknown failure.',
      });
    }
  }

  const failed = records.length - succeeded;
  store.publish({
    type: 'import.completed',
    id: randomUUID(),
    at: new Date().toISOString() as Instant,
    actorId,
    succeeded,
    failed,
  });

  return {
    totalRows: records.length,
    succeeded,
    // Rows, not errors: one bad row can produce several field errors.
    failed,
    errors,
    errorsTruncated: errors.length >= MAX_REPORTED_IMPORT_ERRORS,
    completedAt: new Date().toISOString() as Instant,
  };
}

function pushError(errors: ImportRowError[], error: ImportRowError): void {
  if (errors.length < MAX_REPORTED_IMPORT_ERRORS) {
    errors.push(error);
  }
}
