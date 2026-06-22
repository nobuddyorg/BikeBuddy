'use strict';

const { authMiddleware } = require('../middleware/authMiddleware');
const { usersContainer } = require('../lib/db');

module.exports = async function (context, req, auth = authMiddleware, getContainer = usersContainer) {
  if (!(await auth(context, req))) return;

  const { userId, userEmail, userName } = context;
  const container = getContainer();

  let user;
  try {
    ({ resource: user } = await container.item(userId, userId).read());
  } catch (err) {
    if (err.code !== 404) throw err;
    user = { id: userId, name: userName, email: userEmail, createdAt: new Date().toISOString() };
    ({ resource: user } = await container.items.create(user));
  }

  context.res = {
    status: 200,
    body: { id: user.id, name: user.name, email: user.email, createdAt: user.createdAt },
  };
};
