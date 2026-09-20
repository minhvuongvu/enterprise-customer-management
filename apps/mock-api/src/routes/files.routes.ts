import { parse as parseCsv } from 'csv-parse/sync';
import {
  AVATAR_ALLOWED_MIME_TYPES,
  AVATAR_MAX_BYTES,
  IMPORT_MAX_BYTES,
  IMPORT_MAX_ROWS,
  createCustomerRequestSchema,
  customerListQuerySchema,
  type ImportResult,
  type ImportRowError,
  type Instant,
} from '@ecm/contracts';
import { Router } from 'express';
import multer from 'multer';
import type { MockStore } from '../domain/store.ts';
import { ApiError, badRequest, notFound } from '../http/api-error.ts';
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
 */

/** Errors returned per import; beyond this the response is the problem. */
const MAX_REPORTED_IMPORT_ERRORS = 100;

export function fileRoutes(store: MockStore): Router {
  const router = Router();

  const avatarUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: AVATAR_MAX_BYTES, files: 1 },
    fileFilter: (_req, file, callback) => {
      if (
        !AVATAR_ALLOWED_MIME_TYPES.includes(
          file.mimetype as (typeof AVATAR_ALLOWED_MIME_TYPES)[number],
        )
      ) {
        // The declared type is the client's claim, not proof. A real backend
        // would also inspect the bytes; docs/mock-backend.md says so rather
        // than letting this look like sufficient protection.
        callback(new ApiError('UNSUPPORTED_MEDIA_TYPE', `Unsupported file type ${file.mimetype}.`));
        return;
      }
      callback(null, true);
    },
  });

  const csvUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: IMPORT_MAX_BYTES, files: 1 },
  });

  router.post(
    '/:id/avatar',
    requireAuth,
    requireCsrf,
    requirePermission('CUSTOMER_UPDATE'),
    avatarUpload.single('file'),
    (req, res) => {
      const file = req.file;
      if (!file) {
        throw badRequest('Expected a multipart field named "file".');
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
    csvUpload.single('file'),
    (req, res) => {
      const file = req.file;
      if (!file) {
        throw badRequest('Expected a multipart field named "file".');
      }

      res
        .status(200)
        .json(
          importCsv(
            store,
            file.buffer,
            currentUser(req).id,
            hasScenario(req, 'import-partial-failure'),
          ),
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
          csvCell(customer.fullName),
          customer.email,
          customer.phone ?? '',
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

/** Quotes a value that would otherwise break the row. */
function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function importCsv(
  store: MockStore,
  content: Buffer,
  actorId: Parameters<MockStore['create']>[1],
  injectFailures: boolean,
): ImportResult {
  let records: Record<string, string>[];
  try {
    records = parseCsv(content, {
      columns: true,
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

  const errors: ImportRowError[] = [];
  let succeeded = 0;

  records.forEach((record, index) => {
    // Row 1 is the header, so a spreadsheet's row number is index + 2. Getting
    // this off by one makes every error message point at the wrong line.
    const row = index + 2;

    if (injectFailures && index % 3 === 2) {
      pushError(errors, {
        row,
        column: null,
        code: 'INVALID_FORMAT',
        message: 'Injected import failure.',
      });
      return;
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
      for (const issue of parsed.error.issues) {
        pushError(errors, {
          row,
          column: issue.path[0] ? String(issue.path[0]) : null,
          code: issue.code === 'invalid_type' ? 'REQUIRED' : 'INVALID_FORMAT',
          message: issue.message,
        });
      }
      return;
    }

    try {
      store.create(parsed.data, actorId);
      succeeded += 1;
    } catch (error) {
      pushError(errors, {
        row,
        column: 'email',
        code:
          error instanceof ApiError && error.code === 'CONFLICT'
            ? 'DUPLICATE_EMAIL'
            : 'INVALID_FORMAT',
        message: error instanceof Error ? error.message : 'Unknown failure.',
      });
    }
  });

  return {
    totalRows: records.length,
    succeeded,
    // Rows, not errors: one bad row can produce several field errors.
    failed: records.length - succeeded,
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
