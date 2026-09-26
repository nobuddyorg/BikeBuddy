// Seeds are sized like a heavy real account: a list and map that are cheap at fixture size are not under test.
const PROFILES = {
  normal: {
    vusScale: 1,
    stages: [
      ['30s', 1],
      ['2m', 1],
      ['15s', 0],
    ],
    seed: { tours: 200, largeEvery: 20 },
  },
  peak: {
    vusScale: 5,
    stages: [
      ['1m', 1],
      ['5m', 1],
      ['30s', 0],
    ],
    seed: { tours: 500, largeEvery: 10 },
  },
  stress: {
    vusScale: 20,
    stages: [
      ['2m', 0.25],
      ['2m', 0.5],
      ['2m', 1],
      ['2m', 1],
      ['1m', 0],
    ],
    seed: { tours: 1000, largeEvery: 5 },
  },
};

export const PROFILE_NAME = __ENV.LOAD_PROFILE;
export const PROFILE = PROFILES[PROFILE_NAME];
if (!PROFILE) {
  throw new Error(
    `LOAD_PROFILE must be one of ${Object.keys(PROFILES).join(', ')}, not ${PROFILE_NAME}`,
  );
}
