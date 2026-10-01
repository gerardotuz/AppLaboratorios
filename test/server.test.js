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
test('home screen icon and web app manifest are served with the correct metadata', async () => {
  const address = require('../server').server.address();
  const base = `http://127.0.0.1:${address.port}`;

  const page = await fetch(base);
  const html = await page.text();
  assert.match(html, /rel="apple-touch-icon" sizes="1080x1080" href="\/apple-touch-icon\.png"/);
  assert.match(html, /rel="manifest" href="\/site\.webmanifest"/);
   const logo = await fetch(`${base}/aguila.png`);
  assert.equal(logo.status, 200);
  assert.equal(logo.headers.get('content-type'), 'image/png');

  const icon = await fetch(`${base}/apple-touch-icon.png`);
  assert.equal(icon.status, 200);
  assert.equal(icon.headers.get('content-type'), 'image/png');

  const manifestResponse = await fetch(`${base}/site.webmanifest`);
  assert.equal(manifestResponse.status, 200);
  assert.match(manifestResponse.headers.get('content-type'), /^application\/manifest\+json/);
  const manifest = await manifestResponse.json();
  assert.equal(manifest.short_name, 'Soporte 272');
  assert.ok(manifest.icons.some(({ src }) => src === '/aguila.png'));
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
test('tickets can be assigned only to active administrators', async () => {
  const address = require('../server').server.address();
  const base = `http://127.0.0.1:${address.port}`;
  const login = await fetch(`${base}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@cbtis272.edu.mx', password: 'Admin272!' }) });
  const { token, user } = await login.json();
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

  const adminsResponse = await fetch(`${base}/api/admins`, { headers });
  assert.equal(adminsResponse.status, 200);
  const { admins } = await adminsResponse.json();
  assert.ok(admins.some(admin => admin.id === user.id && admin.name === user.name));

  const ticketsResponse = await fetch(`${base}/api/tickets`, { headers });
  const { tickets } = await ticketsResponse.json();
  const updated = await fetch(`${base}/api/tickets/${tickets[0].id}`, { method: 'PATCH', headers, body: JSON.stringify({ status: 'Atendido', assignedAdminId: user.id, note: 'Asignación de prueba' }) });
  assert.equal(updated.status, 200);
  const { ticket } = await updated.json();
  assert.equal(ticket.assignedAdminId, user.id);
  assert.equal(ticket.assignedAdmin, user.name);
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
