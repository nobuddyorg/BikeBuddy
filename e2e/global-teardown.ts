import { coverageEnabled, coverageReport, type Suite } from './coverage';

// Writes the e2e coverage report (and fails the run below its floor) once every
// worker has added its pages' coverage.
export default async function globalTeardown() {
  if (!coverageEnabled()) return;
  const suite = (process.env.E2E_SUITE as Suite) ?? 'static';
  await coverageReport(suite).generate();
}
