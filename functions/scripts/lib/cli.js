'use strict';

const { parseArgs } = require('node:util');

function requireEnvironment(environment, names) {
  const missing = names.filter((name) => !environment[name]);
  if (missing.length > 0) {
    throw new Error(`Missing environment variables: ${missing.join(', ')}`);
  }
  return Object.fromEntries(names.map((name) => [name, environment[name]]));
}

// Strict: a mistyped flag must stop the run, never fall through to a real one.
function parseFlags(argv, flagNames) {
  const options = Object.fromEntries(flagNames.map((name) => [name, { type: 'boolean' }]));
  const { values } = parseArgs({ args: argv, options, strict: true, allowPositionals: false });
  return Object.fromEntries(flagNames.map((name) => [name, values[name] === true]));
}

async function exitCodeOf({ job, log }) {
  try {
    const succeeded = await job();
    return succeeded ? 0 : 1;
  } catch (error) {
    log.error(error);
    return 1;
  }
}

module.exports = { requireEnvironment, parseFlags, exitCodeOf };
