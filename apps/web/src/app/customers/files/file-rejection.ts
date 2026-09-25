import type { FilePolicy, FileRejection } from '@ecm/contracts';

/**
 * What to tell a user whose file `checkFile` refused.
 *
 * The rejection is a code from the shared policy; the sentence is a
 * translation key with the policy's own limits filled in, so "at most 2 MB"
 * can never disagree with the limit the server enforces.
 */
export function fileRejectionKey(rejection: FileRejection): string {
  return `files.rejection.${rejection}`;
}

/** The policy's limits, for whichever message names them. */
export function fileRejectionParams(policy: FilePolicy): Record<string, string | number> {
  return {
    size: +(policy.maxBytes / (1024 * 1024)).toFixed(1),
    types: policy.extensions.join(', '),
  };
}
