/**
 * One technical lab.
 *
 * Labs exist because some browser techniques - cross-tab coordination, offline
 * behaviour, rendering experiments - do not belong anywhere in a customer
 * management workflow, and forcing them in would produce exactly the
 * "collection of unrelated demos" the project context forbids. They live here
 * instead, isolated, and the core feature never imports from this folder.
 */
export interface LabDescriptor {
  /** URL segment, and the key the catalogue is looked up by. */
  readonly id: string;
  readonly titleKey: string;
  readonly descriptionKey: string;
  /**
   * The phase that implements it, or `null` when it already works.
   *
   * Written down so the index page can say "Phase 5" instead of "coming soon",
   * which is the difference between a plan and an apology.
   */
  readonly plannedPhase: number | null;
}

export const TECHNICAL_LABS: readonly LabDescriptor[] = [
  {
    id: 'api-connectivity',
    titleKey: 'pages.labs.apiConnectivity.title',
    descriptionKey: 'pages.labs.apiConnectivity.description',
    plannedPhase: null,
  },
  {
    id: 'browser-storage',
    titleKey: 'pages.labs.browserStorage.title',
    descriptionKey: 'pages.labs.browserStorage.description',
    plannedPhase: 5,
  },
  {
    id: 'cross-tab',
    titleKey: 'pages.labs.crossTab.title',
    descriptionKey: 'pages.labs.crossTab.description',
    plannedPhase: 5,
  },
  {
    id: 'offline',
    titleKey: 'pages.labs.offline.title',
    descriptionKey: 'pages.labs.offline.description',
    plannedPhase: 5,
  },
  {
    id: 'realtime',
    titleKey: 'pages.labs.realtime.title',
    descriptionKey: 'pages.labs.realtime.description',
    plannedPhase: 4,
  },
  {
    id: 'rendering',
    titleKey: 'pages.labs.rendering.title',
    descriptionKey: 'pages.labs.rendering.description',
    plannedPhase: 5,
  },
];

export function findLab(id: string): LabDescriptor | undefined {
  return TECHNICAL_LABS.find((lab) => lab.id === id);
}
