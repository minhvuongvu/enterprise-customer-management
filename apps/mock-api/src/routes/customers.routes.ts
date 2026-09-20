import {
  bulkRequestSchema,
  createCustomerRequestSchema,
  customerListQuerySchema,
  roleHasPermission,
  updateCustomerRequestSchema,
  type BulkItemResult,
  type BulkResponse,
  type Customer,
  type CustomerId,
  type Permission,
} from '@ecm/contracts';
import { Router } from 'express';
import type { MockStore } from '../domain/store.ts';
import { ApiError, forbidden } from '../http/api-error.ts';
import { pathParam } from '../http/params.ts';
import { parseOrThrow } from '../http/validate.ts';
import { currentUser, requireAuth, requireCsrf, requirePermission } from '../middleware/auth.ts';
import { hasScenario } from '../middleware/fault-injection.ts';

/**
 * Customer endpoints.
 *
 * Every route states the permission it needs. Authorization is a property of
 * the endpoint, not of the UI that happens to call it - which is what makes it
 * testable without a browser, and what the Phase 3 tests do.
 */
export function customerRoutes(store: MockStore): Router {
  const router = Router();

  router.get('/', requireAuth, requirePermission('CUSTOMER_READ'), (req, res) => {
    // Query strings are strings; the schema coerces and applies defaults, so
    // the handler below never sees `"2"` where it expects 2.
    const query = parseOrThrow(customerListQuerySchema, req.query, 'list query');
    res.status(200).json(store.list(query));
  });

  router.get('/:id', requireAuth, requirePermission('CUSTOMER_READ'), (req, res) => {
    res.status(200).json(store.getOrThrow(pathParam(req, 'id')));
  });

  router.get('/:id/audit', requireAuth, requirePermission('CUSTOMER_READ'), (req, res) => {
    // Confirms the customer exists first, so a missing record is a 404 rather
    // than an empty list that looks like "nothing ever happened".
    store.getOrThrow(pathParam(req, 'id'));
    res.status(200).json({ items: store.auditFor(pathParam(req, 'id')) });
  });

  router.post('/', requireAuth, requireCsrf, requirePermission('CUSTOMER_CREATE'), (req, res) => {
    const input = parseOrThrow(createCustomerRequestSchema, req.body, 'customer');
    const created = store.create(input, currentUser(req).id);
    res.status(201).location(`/api/customers/${created.id}`).json(created);
  });

  router.patch(
    '/:id',
    requireAuth,
    requireCsrf,
    requirePermission('CUSTOMER_UPDATE'),
    (req, res) => {
      const input = parseOrThrow(updateCustomerRequestSchema, req.body, 'customer');
      const updated = store.update(
        pathParam(req, 'id'),
        input,
        currentUser(req).id,
        // Reproduces "someone else saved while this form was open" without
        // needing a second client to actually do it.
        hasScenario(req, 'conflict'),
      );
      res.status(200).json(updated);
    },
  );

  router.delete(
    '/:id',
    requireAuth,
    requireCsrf,
    requirePermission('CUSTOMER_DELETE'),
    (req, res) => {
      store.remove(pathParam(req, 'id'), currentUser(req).id);
      res.status(204).end();
    },
  );

  /**
   * Bulk operations.
   *
   * Responds 200 with a per-item outcome even when some items failed. A bulk
   * request is not one operation that either worked or did not: reporting a
   * single status would force the client to either re-check everything or lie
   * to the user about what happened.
   *
   * The required permission depends on the action, so it is checked here rather
   * than by middleware - the body has to be parsed before the answer is known.
   */
  router.post('/bulk', requireAuth, requireCsrf, (req, res) => {
    const request = parseOrThrow(bulkRequestSchema, req.body, 'bulk request');
    const user = currentUser(req);

    const required: Permission =
      request.action === 'DELETE' ? 'CUSTOMER_DELETE' : 'CUSTOMER_UPDATE';
    if (!roleHasPermission(user.role, required)) {
      throw forbidden(`Role ${user.role} does not have ${required}.`);
    }

    const injectFailures = hasScenario(req, 'partial-bulk-failure');
    const results: BulkItemResult[] = request.ids.map((id, position) => {
      if (injectFailures && position % 2 === 1) {
        return { id, outcome: 'FAILED', errorCode: 'CONFLICT' };
      }
      try {
        applyBulkAction(store, request.action, id, user.id);
        return { id, outcome: 'SUCCEEDED' };
      } catch (error) {
        return {
          id,
          outcome: 'FAILED',
          errorCode:
            error instanceof ApiError && error.code === 'NOT_FOUND' ? 'NOT_FOUND' : 'CONFLICT',
        };
      }
    });

    const succeeded = results.filter((result) => result.outcome === 'SUCCEEDED').length;
    const response: BulkResponse = {
      requested: request.ids.length,
      succeeded,
      failed: results.length - succeeded,
      results,
    };
    res.status(200).json(response);
  });

  return router;
}

function applyBulkAction(
  store: MockStore,
  action: 'ACTIVATE' | 'DEACTIVATE' | 'DELETE',
  id: CustomerId,
  actorId: Customer['updatedBy'],
): void {
  switch (action) {
    case 'ACTIVATE':
      store.setStatus(id, 'ACTIVE', actorId);
      return;
    case 'DEACTIVATE':
      store.setStatus(id, 'INACTIVE', actorId);
      return;
    case 'DELETE':
      store.remove(id, actorId);
      return;
  }
}
