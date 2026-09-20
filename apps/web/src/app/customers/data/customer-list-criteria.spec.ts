import {
  criteriaKey,
  criteriaToQueryParams,
  DEFAULT_CRITERIA,
  hasActiveFilters,
  readCriteria,
  withFilterChange,
} from './customer-list-criteria';

/**
 * The URL is the source of truth for list state, which makes this the module
 * that decides what a URL *means*. Every test here is a property someone will
 * rely on without knowing this file exists.
 */
describe('readCriteria', () => {
  it('falls back to a sensible default when the query string is empty', () => {
    expect(readCriteria({})).toEqual(DEFAULT_CRITERIA);
  });

  it('reads the values a URL actually carries, as strings', () => {
    const criteria = readCriteria({
      page: '3',
      size: '50',
      sort: 'fullName,asc',
      search: ' nguyen ',
      status: 'ACTIVE',
      gender: 'FEMALE',
      createdFrom: '2026-01-01',
      createdTo: '2026-02-01',
    });

    expect(criteria).toEqual({
      page: 3,
      size: 50,
      sort: 'fullName,asc',
      search: 'nguyen',
      status: 'ACTIVE',
      gender: 'FEMALE',
      createdFrom: '2026-01-01',
      createdTo: '2026-02-01',
    });
  });

  it('replaces a status nobody defined rather than forwarding it to the server', () => {
    // A hand-edited or truncated URL must render the unfiltered list, not a 422.
    expect(readCriteria({ status: 'DELETED' }).status).toBe('');
    expect(readCriteria({ gender: 'YES' }).gender).toBe('');
  });

  it('rejects a sort parameter unless both halves are valid', () => {
    expect(readCriteria({ sort: 'fullName,asc' }).sort).toBe('fullName,asc');
    // Half-correcting would silently order the list by something the user did
    // not ask for and cannot see is wrong.
    expect(readCriteria({ sort: 'fullName,sideways' }).sort).toBe(DEFAULT_CRITERIA.sort);
    expect(readCriteria({ sort: 'password,asc' }).sort).toBe(DEFAULT_CRITERIA.sort);
  });

  it('clamps an oversized page rather than refusing it', () => {
    // Asking for a thousand rows is a reasonable thing to try; the useful
    // answer is the biggest page the API will serve.
    expect(readCriteria({ size: '1000' }).size).toBe(100);
    expect(readCriteria({ size: '0' }).size).toBe(DEFAULT_CRITERIA.size);
    expect(readCriteria({ page: '-2' }).page).toBe(1);
  });

  it('ignores a date that is not a calendar date', () => {
    expect(readCriteria({ createdFrom: '01/02/2026' }).createdFrom).toBe('');
  });
});

describe('criteriaToQueryParams', () => {
  it('omits everything that is already the default, so the URL stays short', () => {
    const params = criteriaToQueryParams(DEFAULT_CRITERIA);
    expect(Object.values(params).every((value) => value === null)).toBe(true);
  });

  it('removes a parameter rather than emptying it', () => {
    const params = criteriaToQueryParams({ ...DEFAULT_CRITERIA, page: 4, search: 'an' });

    expect(params['page']).toBe(4);
    expect(params['search']).toBe('an');
    // `null` is what tells the router to drop the parameter; `''` would leave
    // `?status=` behind after a reset.
    expect(params['status']).toBeNull();
  });
});

describe('criteriaKey', () => {
  it('is equal for two URLs that mean the same thing', () => {
    const fromShortUrl = readCriteria({ page: '2' });
    const fromLongUrl = readCriteria({ page: '2', size: '20', sort: 'updatedAt,desc' });

    // The cache keys on this, so a miss here is a wasted request on every
    // navigation that spells the same query differently.
    expect(criteriaKey(fromShortUrl)).toBe(criteriaKey(fromLongUrl));
  });

  it('differs when anything the server sees differs', () => {
    const base = DEFAULT_CRITERIA;
    expect(criteriaKey(base)).not.toBe(criteriaKey({ ...base, page: 2 }));
    expect(criteriaKey(base)).not.toBe(criteriaKey({ ...base, search: 'an' }));
    expect(criteriaKey(base)).not.toBe(criteriaKey({ ...base, status: 'ACTIVE' }));
  });
});

describe('withFilterChange', () => {
  it('returns to the first page', () => {
    // The classic list bug: searching from page 7 lands on page 7 of 3 pages
    // of results and shows an empty list that reads as "no matches".
    const changed = withFilterChange({ ...DEFAULT_CRITERIA, page: 7 }, { search: 'an' });

    expect(changed.page).toBe(1);
    expect(changed.search).toBe('an');
  });
});

describe('hasActiveFilters', () => {
  it('ignores paging and sorting, which are not filters', () => {
    expect(hasActiveFilters({ ...DEFAULT_CRITERIA, page: 5, sort: 'email,asc' })).toBe(false);
    expect(hasActiveFilters({ ...DEFAULT_CRITERIA, status: 'ACTIVE' })).toBe(true);
  });
});
