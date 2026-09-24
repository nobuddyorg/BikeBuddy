// Which API a run talks to. The wrapper (load/run.mjs) checks the same things;
// they are repeated here so a bare `k6 run` cannot reach production either.
const LOCAL_HOSTS = ['127.0.0.1', 'localhost'];

function required(name) {
  const value = __ENV[name];
  if (!value) throw new Error(`${name} is not set; run through: ./buddy.sh test load <flow>`);
  return value;
}

export const API_URL = required('LOAD_API_URL').replace(/\/$/, '');
export const TARGET = required('LOAD_TARGET');

const host = /^https?:\/\/([^/:]+)/.exec(API_URL)?.[1];
if (!['local-stack', 'hosted'].includes(TARGET)) {
  throw new Error(`LOAD_TARGET must be local-stack or hosted, not ${TARGET}`);
}
if (TARGET === 'local-stack' && !LOCAL_HOSTS.includes(host)) {
  throw new Error(`LOAD_TARGET=local-stack but ${API_URL} is not a local address`);
}
if (TARGET === 'hosted' && __ENV.LOAD_CONFIRM_PRODUCTION !== 'true') {
  throw new Error(
    'LOAD_TARGET=hosted loads production; set LOAD_CONFIRM_PRODUCTION=true to mean it',
  );
}

// Locally the Functions host runs with SKIP_AUTH (every request is the local dev
// user); hosted needs a real access token of the dedicated load-test account.
const TOKEN = __ENV.LOAD_ACCESS_TOKEN;
if (TARGET === 'hosted' && !TOKEN) throw new Error('LOAD_TARGET=hosted needs LOAD_ACCESS_TOKEN');

export const AUTH_HEADERS = TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {};
