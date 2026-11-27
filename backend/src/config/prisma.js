import "dotenv/config";
import pg from "pg";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MAX_ATTEMPTS = 6;

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // dev only
  max: 5,
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 300000, // keep connections alive, fewer new handshakes
  keepAlive: true,
});

pool.on("error", (e) => console.error("[pg pool]", e.message));

// Opening a connection fails intermittently. Nothing has been sent to the
// database at that point, so redoing it is safe.
const rawConnect = pool.connect.bind(pool);

const connectWithRetry = async () => {
  for (let attempt = 1; ; attempt++) {
    try {
      return await rawConnect();
    } catch (e) {
      if (attempt >= MAX_ATTEMPTS) throw e;
      console.warn(`[pg] connect attempt ${attempt} failed: ${e.message}`);
      await sleep(200 * attempt);
    }
  }
};

// pg-pool calls connect() with a callback internally (for pool.query),
// and with no callback for transactions, so support both.
pool.connect = (cb) => {
  if (typeof cb !== "function") return connectWithRetry();
  connectWithRetry().then(
    (client) => cb(undefined, client, (err) => client.release(err)),
    (err) => cb(err)
  );
};

const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
export default prisma;