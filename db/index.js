// db/index.js
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT
});

pool.connect()
  .then(() => console.log('Connexion PostgreSQL établie'))
  .catch(err => console.error('Erreur connexion PostgreSQL :', err));

module.exports = pool;