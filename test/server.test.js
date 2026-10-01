const test = require('node:test');
const assert = require('node:assert/strict');
const { hashPassword, verifyPassword } = require('../server');

test.before(async () => require('../server').ready);
test.after(async () => { require('../server').server.close(); await require('../server').closeDatabase(); });

test('passwords are salted and verified safely', () => {
  const first = hashPassword('Docente272!');
  const second = hashPassword('Docente272!');
  assert.notEqual(first, second);
  assert.equal(verifyPassword('Docente272!', first), true);
  assert.equal(verifyPassword('incorrecta', first), false);
});

test('health endpoint responds successfully', async () => {
  const address = require('../server').server.address();
  const response = await fetch(`http://127.0.0.1:${address.port}/api/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
});
