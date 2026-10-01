const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const SECRET = process.env.SESSION_SECRET || 'solo-desarrollo-cambiar-en-produccion';
const clients = new Set();
const database = require('./database');

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}
function verifyPassword(password, stored) {
  const [salt, expected] = stored.split(':');
  const actual = crypto.scryptSync(password, salt, 64);
  return crypto.timingSafeEqual(actual, Buffer.from(expected, 'hex'));
}
function seedData() {
    const now = new Date().toISOString();
    return {
      users: [
        { id: 'u1', name: 'Coordinación TI', email: 'admin@cbtis272.edu.mx', role: 'admin', password: hashPassword('Admin272!') },
        { id: 'u2', name: 'Mtra. Laura Hernández', email: 'docente@cbtis272.edu.mx', role: 'teacher', password: hashPassword('Docente272!') }
      ],
      tickets: [
        { id: 'CBT-024', title: 'Equipo no enciende', category: 'Falla de hardware', description: 'El equipo no responde al botón de encendido.', lab: 'Laboratorio 1', equipment: 'PC-15', priority: 'Alta', status: 'Recibido', authorId: 'u2', author: 'Mtra. Laura Hernández', createdAt: now, updatedAt: now, history: [{ status: 'Recibido', note: 'Reporte creado', by: 'Mtra. Laura Hernández', at: now }] },
        { id: 'CBT-023', title: 'Instalación de GeoGebra', category: 'Instalación de software', description: 'Se requiere para la clase del viernes.', lab: 'Laboratorio 2', equipment: 'PC-21', priority: 'Media', status: 'Atendido', authorId: 'u2', author: 'Mtra. Laura Hernández', createdAt: new Date(Date.now()-86400000).toISOString(), updatedAt: now, history: [{ status: 'Recibido', note: 'Reporte creado', by: 'Mtra. Laura Hernández', at: now }, { status: 'Atendido', note: 'Descarga programada', by: 'Coordinación TI', at: now }] }
      ]
    };
}
function tokenFor(user) {
  const payload = Buffer.from(JSON.stringify({ id: user.id, exp: Date.now() + 86400000 })).toString('base64url');
  const signature = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}
async function authenticate(req) {
  const queryToken = new URL(req.url, `http://${req.headers.host || 'localhost'}`).searchParams.get('token');
  const token = (req.headers.authorization || '').replace(/^Bearer /, '') || queryToken || '';
  if (!token) return null;
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;
  const expected = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
  if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (parsed.exp < Date.now()) return null;
    return await database.findUserById(parsed.id) || null;
  } catch { return null; }
}
function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}
function body(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', c => { raw += c; if (raw.length > 1e6) reject(new Error('too large')); });
    req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch { reject(new Error('invalid json')); } });
  });
}
function notify(event) {
  const line = `data: ${JSON.stringify(event)}\n\n`;
  clients.forEach(client => client.write(line));
}
function clean(value, max = 500) { return String(value || '').trim().slice(0, max); }

async function api(req, res, url) {
  if (url.pathname === '/api/health') return json(res, 200, { ok: true });
  if (url.pathname === '/api/login' && req.method === 'POST') {
    const data = await body(req);
    const user = await database.findUser(clean(data.email).toLowerCase());
    if (!user || !verifyPassword(String(data.password || ''), user.password)) return json(res, 401, { error: 'Correo o contraseña incorrectos' });
    const safe = { id: user.id, name: user.name, email: user.email, role: user.role };
    return json(res, 200, { token: tokenFor(user), user: safe });
  }
  const user = await authenticate(req);
  if (!user) return json(res, 401, { error: 'Sesión no válida o vencida' });
  if (url.pathname === '/api/events' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);
    clients.add(res); req.on('close', () => clients.delete(res)); return;
  }
  if (url.pathname === '/api/tickets' && req.method === 'GET') {
    let tickets = await database.listTickets();
    if (user.role !== 'admin') tickets = tickets.filter(t => t.authorId === user.id);
    return json(res, 200, { tickets: tickets.sort((a,b) => b.updatedAt.localeCompare(a.updatedAt)) });
  }
  if (url.pathname === '/api/tickets' && req.method === 'POST') {
    const data = await body(req);
    const required = ['title','category','description','lab','equipment','priority'];
    if (required.some(k => !clean(data[k]))) return json(res, 400, { error: 'Completa todos los campos requeridos' });
    const allTickets = await database.listTickets(); const now = new Date().toISOString();
    const next = Math.max(0, ...allTickets.map(t => Number(t.id.split('-')[1]))) + 1;
    const ticket = { id: `CBT-${String(next).padStart(3,'0')}`, title: clean(data.title, 100), category: clean(data.category, 60), description: clean(data.description, 1000), lab: clean(data.lab, 30), equipment: clean(data.equipment, 20), priority: clean(data.priority, 20), status: 'Recibido', authorId: user.id, author: user.name, createdAt: now, updatedAt: now, history: [{ status: 'Recibido', note: 'Reporte creado', by: user.name, at: now }] };
    await database.createTicket(ticket); notify({ type: 'ticket-created', ticket });
    return json(res, 201, { ticket });
  }
  const match = url.pathname.match(/^\/api\/tickets\/([^/]+)$/);
  if (match && req.method === 'PATCH') {
    if (user.role !== 'admin') return json(res, 403, { error: 'Solo un administrador puede actualizar estados' });
    const data = await body(req); const allowed = ['Recibido','Atendido','Finalizado'];
    if (!allowed.includes(data.status)) return json(res, 400, { error: 'Estado no válido' });
    const updatedAt = new Date().toISOString();
    const historyItem = { status: data.status, note: clean(data.note, 300) || 'Estado actualizado', by: user.name, at: updatedAt };
    const ticket = await database.updateTicket(match[1], { status: data.status, updatedAt }, historyItem);
    if (!ticket) return json(res, 404, { error: 'Ticket no encontrado' });
    notify({ type: 'ticket-updated', ticket }); return json(res, 200, { ticket });
  }
  return json(res, 404, { error: 'Ruta no encontrada' });
}

const types = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.svg':'image/svg+xml' };
function staticFile(req, res, url) {
  const requested = url.pathname === '/' ? '/index.html' : url.pathname;
  const file = path.join(ROOT, 'public', path.normalize(requested).replace(/^(\.\.[/\\])+/, ''));
  if (!file.startsWith(path.join(ROOT, 'public'))) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('No encontrado'); }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' }); res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try { if (url.pathname.startsWith('/api/')) await api(req, res, url); else staticFile(req, res, url); }
  catch (error) { console.error(error); if (!res.headersSent) json(res, 400, { error: 'No se pudo procesar la solicitud' }); }
});
const ready = database.connect(seedData()).then(() => server.listen(PORT, () => console.log(`Soporte CBTis 272 disponible en http://localhost:${PORT}`)));

module.exports = { server, ready, hashPassword, verifyPassword, closeDatabase: database.close };
