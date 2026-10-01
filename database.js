const fs = require('node:fs');
const path = require('node:path');

const DB_FILE = path.join(__dirname, 'data', 'db.json');
let mongo;
let localData;
function configuredMongoUri() {
  const uri = (process.env.MONGODB_URI || '').trim();
  if (!uri) return null;

  // `cluster.mongodb.net` is part of Atlas' documentation example, not a real
  // cluster. Treating it as a connection string makes Node fail during DNS SRV
  // lookup and prevents the web server (including its health check) from booting.
  const placeholder = /(?:@|\.)cluster\.mongodb\.net(?:[/?]|$)/i.test(uri)
    || /(?:USUARIO|CONTRASE(?:Ñ|N)A|<[^>]+>)/i.test(uri);
  if (placeholder) return null;
  return uri;
}

async function connect(seedData) {
   const mongoUri = configuredMongoUri();
  if (mongoUri) {
    const { MongoClient } = require('mongodb');
    const client = new MongoClient(mongoUri);
    await client.connect();
    const databaseName = process.env.MONGODB_DB || 'cbtis272_soporte';
    const db = client.db(databaseName);
    mongo = { client, users: db.collection('users'), tickets: db.collection('tickets') };
    await mongo.users.createIndex({ email: 1 }, { unique: true });
    await mongo.tickets.createIndex({ id: 1 }, { unique: true });
    if (await mongo.users.countDocuments() === 0) await mongo.users.insertMany(seedData.users);
    if (await mongo.tickets.countDocuments() === 0) await mongo.tickets.insertMany(seedData.tickets);
    console.log(`Base de datos MongoDB conectada (${databaseName})`);
    return;
  }
  fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
  if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify(seedData, null, 2));
  localData = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    if ((process.env.MONGODB_URI || '').trim()) {
    console.warn('MONGODB_URI contiene valores de ejemplo; se usará almacenamiento JSON local. Configura en Render la cadena real de MongoDB Atlas.');
  } else {
    console.warn('MONGODB_URI no configurada: usando almacenamiento JSON local.');
  }
}

async function findUser(email) {
  return mongo ? mongo.users.findOne({ email }) : localData.users.find(user => user.email === email);
}
async function findUserById(id) {
  return mongo ? mongo.users.findOne({ id }) : localData.users.find(user => user.id === id);
}
async function listUsers() {
  const projection = { _id: 0, password: 0 };
  return mongo ? mongo.users.find({}, { projection }).sort({ name: 1 }).toArray() : localData.users.map(({ password, ...user }) => user);
}
async function createUser(user) {
  if (mongo) await mongo.users.insertOne(user);
  else { localData.users.push(user); persistLocal(); }
  const { password, ...safeUser } = user;
  return safeUser;
}
async function updateUser(id, changes) {
  if (mongo) {
    const result = await mongo.users.findOneAndUpdate({ id }, { $set: changes }, { returnDocument: 'after', projection: { _id: 0, password: 0 } });
    return result || null;
  }
  const user = localData.users.find(item => item.id === id);
  if (!user) return null;
  Object.assign(user, changes); persistLocal();
  const { password, ...safeUser } = user;
  return safeUser;
}
async function listTickets() {
  return mongo ? mongo.tickets.find({}, { projection: { _id: 0 } }).sort({ updatedAt: -1 }).toArray() : [...localData.tickets];
}
async function createTicket(ticket) {
  if (mongo) await mongo.tickets.insertOne(ticket);
  else { localData.tickets.push(ticket); persistLocal(); }
  return ticket;
}
async function updateTicket(id, changes, historyItem) {
  if (mongo) {
    await mongo.tickets.updateOne({ id }, { $set: changes, $push: { history: historyItem } });
    return mongo.tickets.findOne({ id }, { projection: { _id: 0 } });
  }
  const ticket = localData.tickets.find(item => item.id === id);
  if (!ticket) return null;
  Object.assign(ticket, changes); ticket.history.push(historyItem); persistLocal(); return ticket;
}
function persistLocal() { fs.writeFileSync(DB_FILE, JSON.stringify(localData, null, 2)); }
async function close() { if (mongo) await mongo.client.close(); }

module.exports = { connect, findUser, findUserById, listUsers, createUser, updateUser, listTickets, createTicket, updateTicket, close, configuredMongoUri };
