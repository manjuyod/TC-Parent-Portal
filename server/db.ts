// server/db.ts
import sql from 'mssql';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

// Resolve server/.env regardless of CWD
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

// --- helpers ---
const strip = (v?: string | null) =>
  (v ?? '').trim().replace(/^['"]|['"]$/g, '');

const asBool = (v?: string, def = false) =>
  v == null || v === '' ? def : /^(1|true|yes|on)$/i.test(v.trim());

const asInt = (v?: string, def: number) => {
  const n = v ? parseInt(v, 10) : NaN;
  return Number.isFinite(n) ? n : def;
};

function requireEnv(name: string): string {
  const raw = process.env[name];
  const val = strip(raw);
  if (!val) throw new Error(`[DB] Missing required env var: ${name}`);
  return val;
}

function parseServer(serverRaw: string) {
  const s = strip(serverRaw);
  if (s.includes('\\')) {
    const [host, instanceName] = s.split('\\');
    return { host: strip(host), instanceName: strip(instanceName), port: undefined as number | undefined };
  }
  if (s.includes(',') || s.includes(':')) {
    const sep = s.includes(',') ? ',' : ':';
    const [host, portStr] = s.split(sep);
    return { host: strip(host), instanceName: undefined, port: asInt(strip(portStr), 1433) };
  }
  return { host: s, instanceName: undefined, port: undefined as number | undefined };
}

// Required envs
const SERVER_RAW = requireEnv('CRMSrvAddress'); 
const DB_NAME    = requireEnv('CRMSrvDb');
const DB_USER    = requireEnv('CRMSrvUs');
const DB_PASS    = requireEnv('CRMSrvPs');

// Optional overrides
const DB_PORT_ENV     = strip(process.env.DB_PORT);
const DB_INSTANCE_ENV = strip(process.env.DB_INSTANCE);

const enc   = asBool(process.env.DB_ENCRYPT, true);
const trust = asBool(process.env.DB_TRUST_SERVER_CERT, true);

const parsed = parseServer(SERVER_RAW);
const instanceName = DB_INSTANCE_ENV || parsed.instanceName || undefined;
const port = instanceName ? undefined : (DB_PORT_ENV ? asInt(DB_PORT_ENV, 1433) : (parsed.port ?? 1433));

const config: sql.config = {
  server: parsed.host,
  ...(instanceName ? {} : { port }),
  database: DB_NAME,
  user: DB_USER,
  password: DB_PASS,
  options: {
    encrypt: enc,
    trustServerCertificate: trust,
    enableArithAbort: true,
    ...(instanceName ? { instanceName } : {}),
  },
  pool: {
    max: asInt(process.env.DB_POOL_MAX, 10),
    min: asInt(process.env.DB_POOL_MIN, 0),
    idleTimeoutMillis: asInt(process.env.DB_POOL_IDLE, 30000),
  },
};

console.log('[DB] Config summary:', {
  server: config.server,
  port: (config as any).port ?? '(instance mode)',
  instanceName: (config.options as any).instanceName ?? '(none)',
  database: config.database,
  user: config.user,
  encrypt: config.options?.encrypt,
  trustServerCertificate: config.options?.trustServerCertificate,
});

export const pool = new sql.ConnectionPool(config);

export async function getPool(): Promise<sql.ConnectionPool> {
  if (!pool.connected) {
    await pool.connect();
    console.log('[DB] Connected.');
  }
  return pool;
}

export { sql };
