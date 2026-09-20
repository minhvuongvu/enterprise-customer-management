import { randomUUID } from 'node:crypto';
import {
  findFixtureUserById,
  parseSortParam,
  type AuditEntry,
  type AuditFieldChange,
  type CreateCustomerRequest,
  type Customer,
  type CustomerCode,
  type CustomerId,
  type Instant,
  type PageResponse,
  type ParsedCustomerListQuery,
  type RealtimeEvent,
  type UpdateCustomerRequest,
  type UserId,
} from '@ecm/contracts';
import { conflict, notFound } from '../http/api-error.ts';
import { generateCustomers } from './seed.ts';

/**
 * The dataset, in memory.
 *
 * In memory rather than in a database because the point of this server is to
 * exercise the *frontend*: persistence would add operational weight and teach
 * nothing this project is trying to teach. The cost is that a restart resets
 * everything, which is stated in docs/mock-backend.md rather than discovered.
 *
 * Reads are served from an array and writes keep three indexes in step:
 * id, email and a lowercased search blob. Scanning 50,000 records per keystroke
 * would make the mock the bottleneck and hide the frontend problems it exists
 * to expose.
 */

type ChangeListener = (event: RealtimeEvent) => void;

const COLLATOR = new Intl.Collator('en', { sensitivity: 'base', numeric: true });

function nowInstant(): Instant {
  return new Date().toISOString() as Instant;
}

export class MockStore {
  private customers: Customer[] = [];
  private readonly byId = new Map<string, Customer>();
  private readonly byEmail = new Map<string, string>();
  private readonly searchIndex = new Map<string, string>();
  private readonly auditLog = new Map<string, AuditEntry[]>();
  private readonly avatars = new Map<string, { data: Buffer; contentType: string }>();
  private readonly listeners = new Set<ChangeListener>();
  private nextCodeNumber = 1;

  constructor(seed: number, count: number) {
    this.reseed(seed, count);
  }

  /** Rebuilds the dataset from a seed. Used at startup and by the admin route. */
  reseed(seed: number, count: number): void {
    this.customers = generateCustomers(seed, count);
    this.byId.clear();
    this.byEmail.clear();
    this.searchIndex.clear();
    this.auditLog.clear();
    this.avatars.clear();

    for (const customer of this.customers) {
      this.index(customer);
    }
    this.nextCodeNumber = count + 1;
  }

  get size(): number {
    return this.customers.length;
  }

  subscribe(listener: ChangeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(event: RealtimeEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  /**
   * Broadcasts an event that no write produced.
   *
   * Used by the admin routes to push a system notice, which is what makes the
   * SSE stream testable without having to mutate a customer as a side effect.
   */
  publish(event: RealtimeEvent): void {
    this.emit(event);
  }

  private index(customer: Customer): void {
    this.byId.set(customer.id, customer);
    this.byEmail.set(customer.email.toLowerCase(), customer.id);
    this.searchIndex.set(
      customer.id,
      `${customer.fullName}\u0000${customer.email}\u0000${customer.customerCode}`.toLowerCase(),
    );
  }

  /**
   * Removes a record from the lookup indexes.
   *
   * Deliberately does not touch `avatars`: this runs on every update, and an
   * edit to a phone number must not discard the customer's picture. The avatar
   * is cleaned up in `remove()`, where deletion is actually what was asked for.
   */
  private deindex(customer: Customer): void {
    this.byId.delete(customer.id);
    this.byEmail.delete(customer.email.toLowerCase());
    this.searchIndex.delete(customer.id);
  }

  /** Replaces a record in place, keeping every index in step. */
  private replace(existing: Customer, updated: Customer): void {
    const position = this.customers.indexOf(existing);
    this.deindex(existing);
    this.customers[position] = updated;
    this.index(updated);
  }

  // ---------------------------------------------------------------- reading

  get(id: string): Customer | undefined {
    return this.byId.get(id);
  }

  getOrThrow(id: string): Customer {
    const found = this.byId.get(id);
    if (!found) {
      throw notFound('Customer');
    }
    return found;
  }

  list(query: ParsedCustomerListQuery): PageResponse<Customer> {
    const search = query.search?.trim().toLowerCase();
    const from = query.createdFrom;
    const to = query.createdTo;

    const filtered = this.customers.filter((customer) => {
      if (query.status && customer.status !== query.status) {
        return false;
      }
      if (query.gender && customer.gender !== query.gender) {
        return false;
      }
      // `createdAt` is a UTC ISO string and the bounds are calendar dates, so a
      // prefix comparison is both correct and cheap. `to` is inclusive, which
      // is what a person filling in "to" means.
      if (from && customer.createdAt.slice(0, 10) < from) {
        return false;
      }
      if (to && customer.createdAt.slice(0, 10) > to) {
        return false;
      }
      if (search && !this.searchIndex.get(customer.id)?.includes(search)) {
        return false;
      }
      return true;
    });

    const { field, direction } = parseSortParam(query.sort);
    const sign = direction === 'asc' ? 1 : -1;
    filtered.sort((a, b) => sign * compareCustomers(a, b, field));

    const totalItems = filtered.length;
    const totalPages = Math.ceil(totalItems / query.size);
    const start = (query.page - 1) * query.size;

    return {
      items: filtered.slice(start, start + query.size),
      page: query.page,
      size: query.size,
      totalItems,
      totalPages,
    };
  }

  // ---------------------------------------------------------------- writing

  create(input: CreateCustomerRequest, actor: UserId): Customer {
    const email = input.email.toLowerCase();
    if (this.byEmail.has(email)) {
      // 409 rather than 422: the payload is well-formed, it just lost a race
      // with a record that already exists.
      throw conflict(`A customer with email ${input.email} already exists.`);
    }

    const timestamp = nowInstant();
    const customer: Customer = {
      id: randomUUID() as CustomerId,
      customerCode: `C-${String(this.nextCodeNumber++).padStart(6, '0')}` as CustomerCode,
      fullName: input.fullName,
      email: input.email,
      phone: input.phone,
      dateOfBirth: input.dateOfBirth,
      gender: input.gender,
      status: input.status,
      address: input.address,
      avatarUrl: null,
      tags: input.tags,
      createdAt: timestamp,
      updatedAt: timestamp,
      createdBy: actor,
      updatedBy: actor,
      version: 1,
    };

    this.customers.push(customer);
    this.index(customer);
    this.appendAudit(customer.id, 'CUSTOMER_CREATED', actor, []);
    this.emit({
      type: 'customer.created',
      id: randomUUID(),
      at: timestamp,
      customerId: customer.id,
      actorId: actor,
    });

    return customer;
  }

  /**
   * Applies a partial update, guarded by the version the client last saw.
   *
   * `forceConflict` is the `conflict` fault scenario: it makes the stale-write
   * path reachable without having to orchestrate two real clients.
   */
  update(id: string, input: UpdateCustomerRequest, actor: UserId, forceConflict = false): Customer {
    const existing = this.getOrThrow(id);

    if (forceConflict || input.version !== existing.version) {
      throw conflict(
        `Customer ${existing.customerCode} was modified by someone else.`,
        existing.version,
      );
    }

    if (input.email && input.email.toLowerCase() !== existing.email.toLowerCase()) {
      const owner = this.byEmail.get(input.email.toLowerCase());
      if (owner && owner !== id) {
        throw conflict(`A customer with email ${input.email} already exists.`);
      }
    }

    const { version: _ignored, ...changes } = input;
    const changedFields = Object.keys(changes).filter(
      (key) => !deepEqual(changes[key as keyof typeof changes], existing[key as keyof Customer]),
    );

    const updated: Customer = {
      ...existing,
      ...changes,
      updatedAt: nowInstant(),
      updatedBy: actor,
      version: existing.version + 1,
    };

    this.replace(existing, updated);

    this.appendAudit(
      id,
      changedFields.includes('status') ? 'CUSTOMER_STATUS_CHANGED' : 'CUSTOMER_UPDATED',
      actor,
      changedFields.map((field) => ({
        field,
        previousValue: renderValue(existing[field as keyof Customer]),
        newValue: renderValue(updated[field as keyof Customer]),
      })),
    );

    this.emit({
      type: 'customer.updated',
      id: randomUUID(),
      at: updated.updatedAt,
      customerId: updated.id,
      actorId: actor,
      changedFields,
    });

    return updated;
  }

  remove(id: string, actor: UserId): void {
    const existing = this.getOrThrow(id);
    this.customers.splice(this.customers.indexOf(existing), 1);
    this.deindex(existing);
    this.avatars.delete(id);
    this.auditLog.delete(id);

    this.emit({
      type: 'customer.deleted',
      id: randomUUID(),
      at: nowInstant(),
      customerId: existing.id,
      actorId: actor,
    });
  }

  /** Used by bulk activate/deactivate, which do not carry a version. */
  setStatus(id: string, status: Customer['status'], actor: UserId): Customer {
    const existing = this.getOrThrow(id);
    return this.update(id, { status, version: existing.version }, actor);
  }

  // ----------------------------------------------------------------- avatar

  /**
   * Stores an uploaded avatar and points the customer at it.
   *
   * Not routed through `update()`: an upload carries no client-supplied version
   * to check, and running it through the versioned path would either demand a
   * version the upload form does not have or quietly skip the check that path
   * exists for.
   */
  setAvatar(id: string, data: Buffer, contentType: string, actor: UserId): string {
    const existing = this.getOrThrow(id);
    const url = `/api/customers/${id}/avatar`;

    this.avatars.set(id, { data, contentType });
    const updated: Customer = {
      ...existing,
      avatarUrl: url,
      updatedAt: nowInstant(),
      updatedBy: actor,
      version: existing.version + 1,
    };
    this.replace(existing, updated);

    this.emit({
      type: 'customer.updated',
      id: randomUUID(),
      at: updated.updatedAt,
      customerId: updated.id,
      actorId: actor,
      changedFields: ['avatarUrl'],
    });

    return url;
  }

  getAvatar(id: string): { data: Buffer; contentType: string } | undefined {
    return this.avatars.get(id);
  }

  // ------------------------------------------------------------------ audit

  private appendAudit(
    customerId: string,
    action: AuditEntry['action'],
    actorId: UserId,
    changes: AuditFieldChange[],
  ): void {
    const actor = findFixtureUserById(actorId);
    const entries = this.auditLog.get(customerId) ?? [];
    entries.unshift({
      id: randomUUID(),
      customerId: customerId as CustomerId,
      action,
      occurredAt: nowInstant(),
      actorId,
      actorDisplayName: actor?.displayName ?? 'Unknown user',
      changes,
    });
    this.auditLog.set(customerId, entries);
  }

  /**
   * Audit entries for a customer, newest first.
   *
   * Seeded customers have no recorded history - storing 50,000 synthetic
   * entries would cost memory for data nobody reads. Their creation entry is
   * derived from the fields the record already carries, which is accurate
   * rather than invented.
   */
  auditFor(customerId: string): AuditEntry[] {
    const recorded = this.auditLog.get(customerId) ?? [];
    const customer = this.byId.get(customerId);
    if (!customer) {
      return recorded;
    }

    const hasCreation = recorded.some((entry) => entry.action === 'CUSTOMER_CREATED');
    if (hasCreation) {
      return recorded;
    }

    const actor = findFixtureUserById(customer.createdBy);
    return [
      ...recorded,
      {
        id: `seeded-${customer.id}`,
        customerId: customer.id,
        action: 'CUSTOMER_CREATED',
        occurredAt: customer.createdAt,
        actorId: customer.createdBy,
        actorDisplayName: actor?.displayName ?? 'Unknown user',
        changes: [],
      },
    ];
  }
}

function compareCustomers(a: Customer, b: Customer, field: string): number {
  switch (field) {
    case 'createdAt':
      return a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0;
    case 'updatedAt':
      return a.updatedAt < b.updatedAt ? -1 : a.updatedAt > b.updatedAt ? 1 : 0;
    case 'email':
      return COLLATOR.compare(a.email, b.email);
    case 'customerCode':
      return COLLATOR.compare(a.customerCode, b.customerCode);
    case 'status':
      return COLLATOR.compare(a.status, b.status);
    case 'fullName':
    default:
      // A collator, not `<`: "Đức" must sort next to "Duc", not after "Z".
      return COLLATOR.compare(a.fullName, b.fullName);
  }
}

function renderValue(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
