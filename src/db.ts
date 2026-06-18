import { MongoClient, Db, ObjectId, Collection } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

const uri = process.env.MONGODB_URI || "mongodb+srv://donbok:donbok@verceldb.qc3elli.mongodb.net/?appName=verceldb";
const dbName = "todo_app";

let client: MongoClient | null = null;
let db: Db | null = null;

export async function connectToDatabase(): Promise<Db> {
    if (db) return db;

    if (!client) {
        client = new MongoClient(uri);
        await client.connect();
        console.log('Connected to MongoDB');
    }

    db = client.db(dbName);
    
    // Create indexes for performance/uniqueness
    await db.collection('users').createIndex({ username: 1 }, { unique: true });
    
    return db;
}

// Interfaces for our documents
export interface UserDoc {
    _id?: ObjectId;
    username: string;
    passwordHash: string;
    xp: number;
    level: number;
    avatarUrl?: string;
}

export interface TaskDoc {
    _id?: ObjectId;
    userId: ObjectId;
    text: string;
    completed: boolean;
    isPublic: boolean;
    createdAt: Date;
}

export interface FriendshipDoc {
    _id?: ObjectId;
    userId: ObjectId;
    friendId: ObjectId;
    status: 'pending' | 'accepted';
}

// Database helper object to mimic model access
export const dbOps = {
    users: () => db!.collection<UserDoc>('users'),
    tasks: () => db!.collection<TaskDoc>('tasks'),
    friendships: () => db!.collection<FriendshipDoc>('friendships'),
};

// Legacy syncDatabase for backward compatibility in index.ts
export const syncDatabase = async () => {
    await connectToDatabase();
    console.log('Database connection initialized.');
};

export default { connectToDatabase, dbOps, syncDatabase };
