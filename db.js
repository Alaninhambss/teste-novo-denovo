require('dotenv').config();
const { Pool } = require('pg');

const config = process.env.DATABASE_URL
  ? { connectionString: process.env.DATABASE_URL }
  : {
      user: process.env.DB_USER || 'postgres',
      host: process.env.DB_HOST || 'localhost',
      database: process.env.DB_DATABASE || 'postgres',
      password: process.env.DB_PASSWORD,
      port: Number(process.env.DB_PORT || 5432),
    };

if (process.env.DATABASE_SSL === 'true') {
  config.ssl = { rejectUnauthorized: true };
}

const pool = new Pool(config);

pool.connect((err, client, release) => {
  if (err) {
    console.error('Erro na conexão:', err.message);
    return;
  }

  release();
  console.log('Banco PostgreSQL conectado!');
});

module.exports = pool;