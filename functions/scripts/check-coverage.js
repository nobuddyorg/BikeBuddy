'use strict';

// Gate CI on the coverage report vitest already produces locally (cobertura),
// rather than relying solely on Codecov (third-party, informational only —
// its own service hiccups shouldn't block a PR). Fails if the overall or any
// package's line/branch rate drops below MIN_RATE.
//
// Usage: node scripts/check-coverage.js [path-to-cobertura-xml]

const fs = require('fs');
const { XMLParser } = require('fast-xml-parser');

const MIN_RATE = 0.9;
const file = process.argv[2] || 'coverage/cobertura-coverage.xml';

function main() {
  const xml = fs.readFileSync(file, 'utf8');
  const { coverage } = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' }).parse(
    xml,
  );

  const packages = [].concat(coverage.packages.package);
  const results = [
    {
      name: 'overall',
      lineRate: Number(coverage['@_line-rate']),
      branchRate: Number(coverage['@_branch-rate']),
    },
    ...packages.map((pkg) => ({
      name: pkg['@_name'],
      lineRate: Number(pkg['@_line-rate']),
      branchRate: Number(pkg['@_branch-rate']),
    })),
  ];

  const pct = (n) => `${(n * 100).toFixed(2)}%`;
  for (const r of results) {
    console.log(
      `${r.name.padEnd(20)} line ${pct(r.lineRate).padEnd(8)} branch ${pct(r.branchRate)}`,
    );
  }

  const failures = results.filter((r) => r.lineRate < MIN_RATE || r.branchRate < MIN_RATE);
  if (failures.length > 0) {
    console.error(`\nCoverage gate failed: below ${pct(MIN_RATE)} line/branch coverage:`);
    for (const f of failures) console.error(`  - ${f.name}`);
    process.exitCode = 1;
    return;
  }

  console.log(`\nAll packages meet the ${pct(MIN_RATE)} line/branch coverage threshold.`);
}

main();
