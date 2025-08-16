import { drizzle } from "drizzle-orm/node-postgres";
import { Client } from "pg";

// Create a PostgreSQL client for this template
// In production, you would use the SQL Server connection from the attached file
const client = new Client({
  connectionString: process.env.DATABASE_URL || "postgresql://localhost:5432/tutoring_portal",
});

await client.connect();
export const db = drizzle(client);
