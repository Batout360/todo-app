import type { NextApiRequest, NextApiResponse } from 'next';
import client from '../../../my-mongodb-app/lib/mongodb';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { host } = req.body;
  if (!host || typeof host !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid host in request body' });
  }

  try {
    await client.connect();
    const db = client.db(); // default database from MONGODB_URI
    const configColl = db.collection('config');
    await configColl.updateOne(
      { key: 'siteHost' },
      { $set: { value: host } },
      { upsert: true }
    );
    res.status(200).json({ success: true, host });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to update host in database' });
  }
}
