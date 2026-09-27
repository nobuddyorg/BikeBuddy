// Usage: node scripts/quality/verify-vendor.mjs [--write]   (--write re-copies after a version bump)
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const FRONTEND = fileURLToPath(new URL('../../frontend/', import.meta.url));
const VENDOR = `${FRONTEND}src/vendor/`;

const LIBRARIES = [
  {
    packageName: '@azure/msal-browser',
    provenanceFile: '.msal-source',
    files: [['lib/msal-browser.min.js', 'msal-browser.min.js']],
  },
  {
    packageName: 'leaflet',
    provenanceFile: '.leaflet-source',
    files: [
      ['dist/leaflet.js', 'leaflet/leaflet.js'],
      ['dist/leaflet.css', 'leaflet/leaflet.css'],
      ...['layers', 'layers-2x', 'marker-icon', 'marker-icon-2x', 'marker-shadow'].map((image) => [
        `dist/images/${image}.png`,
        `leaflet/images/${image}.png`,
      ]),
    ],
  },
];

const sha256 = (path) => createHash('sha256').update(readFileSync(path)).digest('base64');

function installedVersion(packageName) {
  const manifest = `${FRONTEND}node_modules/${packageName}/package.json`;
  if (!existsSync(manifest)) {
    throw new Error(`${packageName} is not installed: run \`npm ci\` in frontend/ first`);
  }
  return JSON.parse(readFileSync(manifest, 'utf8')).version;
}

function problems(library) {
  const version = installedVersion(library.packageName);
  const found = library.files.flatMap(([packagePath, vendorPath]) => {
    const vendored = `${VENDOR}${vendorPath}`;
    if (!existsSync(vendored)) return [`${vendorPath} is missing`];
    const upstream = `${FRONTEND}node_modules/${library.packageName}/${packagePath}`;
    if (readFileSync(vendored).equals(readFileSync(upstream))) return [];
    return [`${vendorPath} differs from ${library.packageName}@${version}/${packagePath}`];
  });
  const provenance = readFileSync(`${VENDOR}${library.provenanceFile}`, 'utf8');
  if (!provenance.includes(`${library.packageName}@${version}`)) {
    found.push(`${library.provenanceFile} does not name ${library.packageName}@${version}`);
  }
  return found;
}

function copy(library) {
  const version = installedVersion(library.packageName);
  const lines = library.files.map(([packagePath, vendorPath]) => {
    const upstream = `${FRONTEND}node_modules/${library.packageName}/${packagePath}`;
    copyFileSync(upstream, `${VENDOR}${vendorPath}`);
    return `  ${packagePath} -> ${vendorPath}  sha256-${sha256(upstream)}`;
  });
  writeFileSync(
    `${VENDOR}${library.provenanceFile}`,
    [
      `Copied from the npm package ${library.packageName}@${version} (integrity pinned in frontend/package-lock.json)`,
      'by scripts/quality/verify-vendor.mjs --write:',
      ...lines,
      '',
    ].join('\n'),
  );
  console.log(`Copied ${library.packageName}@${version} into frontend/src/vendor/.`);
}

const { values } = parseArgs({ options: { write: { type: 'boolean', default: false } } });
if (values.write) {
  LIBRARIES.forEach(copy);
} else {
  const found = LIBRARIES.flatMap(problems);
  if (found.length > 0) {
    console.error(
      [
        'frontend/src/vendor/ is not byte-identical to frontend/node_modules:',
        ...found.map((problem) => `  - ${problem}`),
        'After a version bump, run: node scripts/quality/verify-vendor.mjs --write',
      ].join('\n'),
    );
    process.exitCode = 1;
  }
}
