import sql from 'mssql';

// SQL Server configuration using Replit secrets
const config: sql.config = {
  server: process.env.CRMSrvAddress || '',
  database: process.env.CRMSrvDb || '',
  user: process.env.CRMSrvUs || '',
  password: process.env.CRMSrvPs || '',
  options: {
    encrypt: true,
    trustServerCertificate: true,
    enableArithAbort: true,
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
  },
};

// Create connection pool
export const pool = new sql.ConnectionPool(config);

// Connect to the database
export async function connectToDatabase() {
  try {
    await pool.connect();
    console.log('Connected to SQL Server database');
    return pool;
  } catch (err) {
    console.error('Database connection failed:', err);
    throw err;
  }
}

// Initialize connection
connectToDatabase().catch(console.error);
