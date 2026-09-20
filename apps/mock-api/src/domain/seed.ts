import type { Customer, CustomerId, DateOnly, Instant, UserId } from '@ecm/contracts';
import { FIXTURE_USERS } from '@ecm/contracts';

/**
 * Deterministic data generation.
 *
 * The same seed always produces the same dataset, byte for byte. That is what
 * makes a screenshot reproducible, a failing test re-runnable, and "customer
 * C-000042" mean the same thing on two machines.
 *
 * `Math.random()` is never used here. It is used for latency jitter, where
 * variation is the point, and nowhere else.
 */

/**
 * mulberry32: small, fast, and good enough for test data.
 *
 * Not for anything security-related - it is entirely predictable, which is
 * exactly why it is right for this and wrong for a token.
 */
export function createRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rng: () => number, values: readonly T[]): T {
  return values[Math.floor(rng() * values.length)];
}

function intBetween(rng: () => number, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

const HEX = '0123456789abcdef';

/** A v4-shaped UUID drawn from the seeded generator, so ids are reproducible. */
function seededUuid(rng: () => number): string {
  let out = '';
  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) {
      out += '-';
    } else if (i === 14) {
      out += '4';
    } else if (i === 19) {
      out += HEX[8 + Math.floor(rng() * 4)];
    } else {
      out += HEX[Math.floor(rng() * 16)];
    }
  }
  return out;
}

// Deliberately mixed: ASCII and Vietnamese, short and long, with repeats. A
// dataset of tidy seven-letter ASCII names hides sorting, collation and layout
// problems that appear the moment real customers arrive.
const GIVEN_NAMES = [
  'Ada',
  'Linh',
  'Mateo',
  'Yuki',
  'Amara',
  'Tomás',
  'Ngọc',
  'Oliver',
  'Fatima',
  'Jonas',
  'Priya',
  'Đức',
  'Sofia',
  'Hiroshi',
  'Zara',
  'Lars',
  'Thảo',
  'Ibrahim',
  'Elena',
  'Kwame',
  'Marie-Claire',
  'An',
  'Bao',
  'Chloé',
  'Dmitri',
  'Eun-ji',
  'Farid',
  'Greta',
  'Hòa',
  'Isla',
];

const FAMILY_NAMES = [
  'Nguyễn',
  'Smith',
  'García',
  'Tanaka',
  'Okafor',
  'Müller',
  'Trần',
  'O’Brien',
  'Rossi',
  'Kowalski',
  'Lê',
  'Andersson',
  'Haddad',
  'Silva',
  'Phạm',
  'Novák',
  'Ivanova',
  'Bakker',
  'Hoàng',
  'Costa',
];

const CITIES = [
  ['Hà Nội', 'VN', '100000'],
  ['Hồ Chí Minh', 'VN', '700000'],
  ['Đà Nẵng', 'VN', '550000'],
  ['Singapore', 'SG', '018956'],
  ['Tokyo', 'JP', '100-0001'],
  ['Berlin', 'DE', '10115'],
  ['Lisbon', 'PT', '1000-001'],
  ['Dublin', 'IE', 'D01'],
  ['Toronto', 'CA', 'M5H'],
  ['São Paulo', 'BR', '01000-000'],
  ['Nairobi', 'KE', '00100'],
  ['Kraków', 'PL', '30-001'],
] as const;

const STREETS = [
  'Lê Lợi',
  'Main Street',
  'Hauptstraße',
  'Rua Augusta',
  'Bahnhofstrasse',
  'Nguyễn Huệ',
];
const EMAIL_DOMAINS = ['example.test', 'mail.test', 'corp.test', 'work.test'];
const TAG_POOL = ['vip', 'lead', 'renewal', 'enterprise', 'smb', 'churn-risk', 'referral', 'trial'];

const STATUS_WEIGHTS = [
  { value: 'ACTIVE' as const, weight: 62 },
  { value: 'PROSPECT' as const, weight: 25 },
  { value: 'INACTIVE' as const, weight: 13 },
];

const GENDERS = ['MALE', 'FEMALE', 'OTHER', 'UNSPECIFIED'] as const;

function weightedStatus(rng: () => number): Customer['status'] {
  const total = STATUS_WEIGHTS.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = rng() * total;
  for (const entry of STATUS_WEIGHTS) {
    roll -= entry.weight;
    if (roll <= 0) {
      return entry.value;
    }
  }
  return 'ACTIVE';
}

/** The window `createdAt` values fall in. Fixed, so the dataset does not age. */
const EPOCH_START = Date.UTC(2023, 0, 1);
const EPOCH_END = Date.UTC(2026, 8, 1);

export interface SeededDataset {
  readonly customers: Customer[];
}

export function generateCustomers(seed: number, count: number): Customer[] {
  const rng = createRng(seed);
  const actorIds = FIXTURE_USERS.map((user) => user.id);
  const customers: Customer[] = new Array(count);

  for (let index = 0; index < count; index++) {
    const given = pick(rng, GIVEN_NAMES);
    const family = pick(rng, FAMILY_NAMES);
    const fullName = `${given} ${family}`;

    const createdMs = intBetween(rng, EPOCH_START, EPOCH_END);
    // An update never precedes a creation. Getting this wrong makes "sort by
    // updatedAt" produce nonsense that looks like a frontend bug.
    const updatedMs = intBetween(rng, createdMs, EPOCH_END);

    const [city, country, postalCode] = pick(rng, CITIES);
    const hasAddress = rng() > 0.1;
    const hasPhone = rng() > 0.15;
    const hasDateOfBirth = rng() > 0.08;

    const tagCount = intBetween(rng, 0, 3);
    const tags: string[] = [];
    for (let t = 0; t < tagCount; t++) {
      const tag = pick(rng, TAG_POOL);
      if (!tags.includes(tag)) {
        tags.push(tag);
      }
    }

    const createdBy = pick(rng, actorIds) as UserId;

    customers[index] = {
      id: seededUuid(rng) as CustomerId,
      customerCode: `C-${String(index + 1).padStart(6, '0')}`,
      fullName,
      // Unique by construction: the API rejects a duplicate email with a 409,
      // and a seeded collision would make that behaviour untestable.
      email: `${given.toLowerCase().replace(/[^a-z]/g, '')}.${index + 1}@${pick(rng, EMAIL_DOMAINS)}`,
      phone: hasPhone ? `+84${intBetween(rng, 900000000, 999999999)}` : null,
      dateOfBirth: hasDateOfBirth
        ? (new Date(
            Date.UTC(intBetween(rng, 1955, 2006), intBetween(rng, 0, 11), intBetween(rng, 1, 28)),
          )
            .toISOString()
            .slice(0, 10) as DateOnly)
        : null,
      gender: pick(rng, GENDERS),
      status: weightedStatus(rng),
      address: hasAddress
        ? {
            line1: `${intBetween(rng, 1, 400)} ${pick(rng, STREETS)}`,
            line2: rng() > 0.8 ? `Floor ${intBetween(rng, 1, 30)}` : null,
            city,
            postalCode,
            country,
          }
        : null,
      avatarUrl: null,
      tags,
      createdAt: new Date(createdMs).toISOString() as Instant,
      updatedAt: new Date(updatedMs).toISOString() as Instant,
      createdBy,
      updatedBy: rng() > 0.5 ? (pick(rng, actorIds) as UserId) : createdBy,
      version: intBetween(rng, 1, 5),
    };
  }

  return customers;
}
