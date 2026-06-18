import { config } from "dotenv";
config({ path: "../my-mongodb-app/.env.local" });

import { getConnectedClient } from "../my-mongodb-app/lib/mongodb";

async function main() {
  try {
    const client = await getConnectedClient();
    // Ping admin DB – this will throw if the connection cannot be established.
    const pingResult = await client.db("admin").command({ ping: 1 });
    console.log(`✅ MongoDB ping succeeded: ${JSON.stringify(pingResult)}`);

    // Optional cleanup for local dev
    if (process.env.NODE_ENV !== "production") await client.close();
  } catch (err: any) {
    console.error("❌ Failed to connect or ping MongoDB:", err.message || err);
    process.exit(1);
  }
}

main();