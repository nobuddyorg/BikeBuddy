// Replay a failure: FC_SEED=<seed> FC_PATH=<path> npm test -- <file> (developer-guide.md).
import fc from 'fast-check';

const seed = process.env.FC_SEED ? Number(process.env.FC_SEED) : undefined;
const path = process.env.FC_PATH || undefined;

fc.configureGlobal({
  numRuns: 200,
  ...(seed !== undefined && { seed }),
  ...(path && { path, endOnFailure: true }),
});
