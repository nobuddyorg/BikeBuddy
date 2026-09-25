// Global fast-check settings for every property test (vitest setupFiles).
// A failure prints its seed and path; replay exactly that run with
//   FC_SEED=<seed> FC_PATH=<path> npm test -- <file>
// (docs/how-to/developer-guide.md, "Replay a property-test failure").
import fc from 'fast-check';

const seed = process.env.FC_SEED ? Number(process.env.FC_SEED) : undefined;
const path = process.env.FC_PATH || undefined;

fc.configureGlobal({
  numRuns: 200,
  ...(seed !== undefined && { seed }),
  ...(path && { path, endOnFailure: true }),
});
