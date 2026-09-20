import type { FeatureFlag } from '../core/config/app-config';
import type { NavIconName } from './nav-icon';

/** One entry in the primary navigation. */
export interface NavItem {
  /** Absolute route. Absolute so the sidebar works from any depth. */
  readonly path: string;
  /** Translation key. Never a label - see rule 1. */
  readonly labelKey: string;
  readonly icon: NavIconName;
  /** When set, the entry is hidden unless the flag is on. */
  readonly feature?: FeatureFlag;
}

/**
 * The navigation model, as data rather than as markup.
 *
 * Two reasons it is a list and not a template full of `<a>` elements: the
 * sidebar and the mobile drawer render the same entries and must not drift,
 * and Phase 3 filters this list by permission - which is one `filter` over
 * data, and a rewrite over markup.
 *
 * Deliberately not a registry that features push into at runtime. Navigation
 * order is an editorial decision about the product, and a list that is
 * assembled from six places has no owner.
 */
export const PRIMARY_NAV: readonly NavItem[] = [
  { path: '/customers', labelKey: 'nav.customers', icon: 'customers' },
  {
    path: '/technical-labs',
    labelKey: 'nav.technicalLabs',
    icon: 'labs',
    feature: 'technicalLabs',
  },
];
