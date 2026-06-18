"use server";

import { getConnectedClient } from "@/lib/mongodb";

export async function testDatabaseConnection() {
  try {
    const mongoClient = await getConnectedClient();
    // Send a ping to confirm a successful connection
    await mongoClient.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!",
    ); // because this is a server action, the console.log will be outputted to your terminal not in the browser
    return true;
  } catch (e) {
    console.error(e);
    return false;
  }
}
