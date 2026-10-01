const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { hashPassword, verifyPassword } = require('../server');
const { configuredMongoUri } = require('../database');
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
test('administrators can create, list and deactivate users', async () => {
  const address = require('../server').server.address();
  const base = `http://127.0.0.1:${address.port}`;
  const login = await fetch(`${base}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@cbtis272.edu.mx', password: 'Admin272!' }) });
  assert.equal(login.status, 200);
  const { token } = await login.json();
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
  const email = `docente.${Date.now()}@cbtis272.edu.mx`;
  const created = await fetch(`${base}/api/users`, { method: 'POST', headers, body: JSON.stringify({ name: 'Docente de Prueba', email, role: 'teacher', password: 'Temporal272!' }) });
  assert.equal(created.status, 201);
  const { user } = await created.json();
  assert.equal(user.email, email);
  assert.equal(user.password, undefined);

  const updated = await fetch(`${base}/api/users/${user.id}`, { method: 'PATCH', headers, body: JSON.stringify({ active: false }) });
  assert.equal(updated.status, 200);
  assert.equal((await updated.json()).user.active, false);

  const users = await fetch(`${base}/api/users`, { headers });
  assert.equal(users.status, 200);
  assert.ok((await users.json()).users.some(item => item.id === user.id && item.active === false));
});



test('Render installs production dependencies during the build', () => {
  const renderConfig = fs.readFileSync(path.join(__dirname, '..', 'render.yaml'), 'utf8');
  assert.match(renderConfig, /^\s*buildCommand:\s*npm install --omit=dev\s*$/m);
});


test('MongoDB Atlas example URI is not used as a real connection string', () => {
  const previous = process.env.MONGODB_URI;
  process.env.MONGODB_URI = 'mongodb+srv://USUARIO:CONTRASENA@cluster.mongodb.net/?retryWrites=true&w=majority';
  assert.equal(configuredMongoUri(), null);

  process.env.MONGODB_URI = 'mongodb+srv://app:secret@production.abc12.mongodb.net/?retryWrites=true&w=majority';
  assert.equal(configuredMongoUri(), process.env.MONGODB_URI);

  if (previous === undefined) delete process.env.MONGODB_URI;
  else process.env.MONGODB_URI = previous;
});
