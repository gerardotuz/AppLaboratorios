const fs = require('node:fs');
const path = require('node:path');

const DB_FILE = path.join(__dirname, 'data', 'db.json');
let mongo;
let localData;

async function connect(seedData) {
  if (process.env.MONGODB_URI) {
    const { MongoClient } = require('mongodb');
    const client = new MongoClient(process.env.MONGODB_URI);
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
  console.warn('MONGODB_URI no configurada: usando almacenamiento JSON local.');
}

async function findUser(email) {
  return mongo ? mongo.users.findOne({ email }) : localData.users.find(user => user.email === email);
}
async function findUserById(id) {
  return mongo ? mongo.users.findOne({ id }) : localData.users.find(user => user.id === id);
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

module.exports = { connect, findUser, findUserById, listTickets, createTicket, updateTicket, close };
