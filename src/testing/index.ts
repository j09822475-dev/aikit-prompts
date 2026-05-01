export { createABTest } from './ab-test.js';
export { fnv1a32, bucketize } from './hash.js';
export { stickyUserOrSession, identifierFromKey } from './traffic.js';
export type {
  ABTest,
  ABTestOptions,
  Assignment,
  AssignmentContext,
  IdentifierFn,
  VariantDefinition,
} from './types.js';
