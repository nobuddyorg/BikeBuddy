// load/run.mjs checks the same; repeated so a bare `k6 run` cannot reach production either.
const LOCAL_HOSTS = ['127.0.0.1', 'localhost'];

const configuredUrl = __ENV.LOAD_API_URL;
if (!configuredUrl) {
  throw new Error('LOAD_API_URL is not set; run through: ./buddy.sh test load <flow>');
}

export const API_URL = configuredUrl.replace(/\/$/, '');

const host = /^https?:\/\/([^/:]+)/.exec(API_URL)?.[1];
if (!LOCAL_HOSTS.includes(host)) {
  throw new Error(`Load tests run only against the local stack; ${API_URL} is not a local address`);
}
