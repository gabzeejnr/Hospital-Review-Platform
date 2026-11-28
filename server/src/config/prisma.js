import "dotenv/config";
import { PrismaClient } from "@prisma/client";

// One shared client for the whole app. Prisma 6 connects with its own engine
// and manages the connection pool, so there is no pg pool or adapter here.
// Pool size and timeouts are set on DATABASE_URL (see section 6 of the README).
const prisma = new PrismaClient();

export default prisma;