'use strict';

// PATCH then GET against one store: a chosen name survives every later sign-in (#551).

const { getMe } = require('../../src/GetMe/index');
const { updateProfile } = require('../../src/UpdateProfile/index');
const { fakeUsersContainer } = require('../fakes/cosmosContainer');
const { signedInAs, fixedClock } = require('../fakes/collaborators');

describe('profile: PATCH then GET /api/me', () => {
  it('keeps the chosen name and fills the email from the token', async () => {
    const users = fakeUsersContainer();
    const store = { usersContainer: () => users, now: fixedClock };
    const firstSignIn = signedInAs('u1', { userName: null, userEmail: null });
    const laterSignIn = signedInAs('u1', { userName: 'Token Name', userEmail: 'ada@example.com' });

    await getMe({}, { ...store, authenticate: firstSignIn });
    const patched = await updateProfile(
      { json: async () => ({ name: 'Chosen Name' }) },
      { ...store, authenticate: firstSignIn },
    );
    const afterSignIn = await getMe({}, { ...store, authenticate: laterSignIn });
    const again = await getMe({}, { ...store, authenticate: laterSignIn });

    expect(patched.jsonBody.name).toBe('Chosen Name');
    expect(afterSignIn.jsonBody).toMatchObject({ name: 'Chosen Name', email: 'ada@example.com' });
    expect(again.jsonBody).toMatchObject({ name: 'Chosen Name', email: 'ada@example.com' });
  });
});
