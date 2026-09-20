import { Injectable } from '@angular/core';
import type { Customer, CustomerId, PageResponse } from '@ecm/contracts';

/**
 * How many pages of results are kept. Twenty pages at the default size is
 * 400 records - enough that paging back and forth is instant, small enough
 * that browsing a 50,000-row dataset does not accumulate the whole thing.
 */
const MAX_CACHED_PAGES = 20;

/**
 * The customer feature's explicit cache, as ANGULAR_PROJECT_CONTEXT.md §5.5
 * requires: keyed by the normalised query, with invalidation rules written
 * down rather than implied.
 *
 * It holds two things and knows the relationship between them:
 *
 *  - **pages**, keyed by `criteriaKey` - the answer to a specific question;
 *  - **entities**, keyed by id - the customers seen in any of those answers.
 *
 * Storing entities from a list response is what makes clicking a row feel
 * instant: the detail page already has a customer to render, and revalidates
 * it in the background rather than showing a spinner for data it is holding.
 *
 * ## Invalidation rules
 *
 * | Mutation | Pages         | Entity                        |
 * | -------- | ------------- | ----------------------------- |
 * | create   | all dropped   | -                             |
 * | update   | all dropped   | replaced with the response    |
 * | delete   | all dropped   | dropped                       |
 * | bulk     | all dropped   | dropped for every id affected |
 *
 * Every mutation drops **all** pages rather than patching the affected row,
 * and that is deliberate. A write can change which page a record belongs on:
 * under the default `updatedAt,desc` an edit moves the record to page one, and
 * under a status filter a deactivation removes it from the result set
 * entirely. Patching the row in place would leave a cache that is
 * self-consistent and wrong - the hardest kind of bug to see, because every
 * individual value on screen is correct.
 *
 * Entities survive, because an id still means the same record.
 *
 * Lifetime: provided by the customers route, so it exists while the user is
 * somewhere under `/customers` and is discarded on the way out. Nothing about
 * one user's browsing needs to outlive that, and a cache that does is how
 * stale data survives a logout.
 */
@Injectable()
export class CustomerCache {
  /** Insertion-ordered, and re-inserted on read, which makes eviction LRU. */
  private readonly pages = new Map<string, PageResponse<Customer>>();
  private readonly entities = new Map<string, Customer>();

  getPage(key: string): PageResponse<Customer> | null {
    const page = this.pages.get(key);
    if (!page) {
      return null;
    }
    // Re-inserting moves it to the end of the iteration order, so the entry
    // evicted below is genuinely the least recently used one.
    this.pages.delete(key);
    this.pages.set(key, page);
    return page;
  }

  putPage(key: string, page: PageResponse<Customer>): void {
    this.pages.delete(key);
    this.pages.set(key, page);

    for (const customer of page.items) {
      this.entities.set(customer.id, customer);
    }

    while (this.pages.size > MAX_CACHED_PAGES) {
      const oldest = this.pages.keys().next();
      if (oldest.done) {
        break;
      }
      this.pages.delete(oldest.value);
    }
  }

  getEntity(id: CustomerId): Customer | null {
    return this.entities.get(id) ?? null;
  }

  putEntity(customer: Customer): void {
    this.entities.set(customer.id, customer);
  }

  dropEntity(id: CustomerId): void {
    this.entities.delete(id);
  }

  /** Called by every mutation. See the table above for why it is every one. */
  invalidatePages(): void {
    this.pages.clear();
  }

  /** Test and diagnostic visibility. Nothing in the application reads these. */
  get pageCount(): number {
    return this.pages.size;
  }

  get entityCount(): number {
    return this.entities.size;
  }
}
