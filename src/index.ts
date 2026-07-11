import express, { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { syncDatabase, dbOps } from './db';
import { ObjectId } from 'mongodb';
import { put, get } from '@vercel/blob';
import { Readable } from 'stream';
import crypto from 'crypto';
import path from 'path';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;
const SECRET_KEY = process.env.JWT_SECRET || 'your-very-secret-key';
const BLOB_WEBHOOK_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAMuzyERkoZGQ8wnpthQtEveB4DrLcF/O8xfTJEHG20Ds=
-----END PUBLIC KEY-----`;

app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// --- Helper for Webhook Verification ---
function verifyVercelSignature(body: string, signature: string): boolean {
    try {
        return crypto.verify(
            null,
            Buffer.from(body),
            BLOB_WEBHOOK_PUBLIC_KEY,
            Buffer.from(signature, 'base64')
        );
    } catch (err) {
        console.error('Signature verification error:', err);
        return false;
    }
}

// --- Database Sync Middleware ---
let isSynced = false;
app.use(async (req, res, next) => {
    if (!isSynced) {
        try {
            await syncDatabase();
            isSynced = true;
        } catch (err) {
            console.error('DB Sync Error:', err);
        }
    }
    next();
});

const calculateLevel = (xp: number) => Math.floor(xp / 500) + 1;

app.get('/health', (req: Request, res: Response) => {
    res.status(200).json({ status: 'ok' });
});

// --- Auth Middleware ---
const authenticateToken = (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    jwt.verify(token, SECRET_KEY, (err: any, user: any) => {
        if (err) return res.status(403).json({ error: 'Forbidden' });
        (req as any).user = { ...user, id: new ObjectId(user.id) };
        next();
    });
};

// Helper to safely extract string from query params
const getStringParam = (param: any): string | undefined => {
    if (typeof param === 'string') return param;
    if (Array.isArray(param)) return param[0];
    return undefined;
};

// --- Avatar Routes ---
app.get('/api/avatar/view', async (req: Request, res: Response) => {
    const pathname = getStringParam(req.query.pathname);
    if (!pathname) return res.status(400).json({ error: 'Missing pathname' });

    try {
        const result = await get(pathname, { access: 'private' });
        if (!result || result.statusCode !== 200) return res.status(result?.statusCode || 404).send('Not found');

        res.setHeader('Content-Type', result.blob.contentType || 'application/octet-stream');
        if (result.stream) Readable.fromWeb(result.stream as any).pipe(res);
        else res.status(404).send('No content available');
    } catch (err) {
        res.status(404).send('Not found');
    }
});

app.post('/api/blob/webhook', express.text({ type: 'application/json' }), async (req: Request, res: Response) => {
    const signature = req.headers['x-vercel-signature'] as string;
    const rawBody = req.body as string;

    if (!signature || !verifyVercelSignature(rawBody, signature)) return res.status(401).send('Unauthorized');

    try {
        const event = JSON.parse(rawBody);
        if (event.type === 'blob.created') {
            const pathname = event.payload.blob.pathname;
            const match = pathname.match(/avatars\/([a-f\d]{24})-/);
            const userId = match?.[1] || null;

            if (userId) {
                await dbOps.users().updateOne(
                    { _id: new ObjectId(userId) },
                    { $set: { avatarUrl: `/api/avatar/view?pathname=${pathname}` } }
                );
            }
        }
        res.status(200).send('OK');
    } catch (err) {
        res.status(500).send('Internal server error');
    }
});

app.post('/api/avatar/upload', authenticateToken, express.raw({ type: 'image/*', limit: '4.5mb' }), async (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    const filename = getStringParam(req.query.filename);

    if (!filename || !req.body) return res.status(400).json({ error: 'Filename and image data required' });

    try {
        const blob = await put(`avatars/${userId.toString()}-${filename}`, req.body, {
            access: 'private',
            addRandomSuffix: true
        });

        const avatarUrl = `/api/avatar/view?pathname=${blob.pathname}`;
        await dbOps.users().updateOne({ _id: userId }, { $set: { avatarUrl } });

        res.json({ ...blob, avatarUrl });
    } catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

// --- Auth Routes ---
app.post('/api/auth/register', async (req: Request, res: Response) => {
    let { username, password } = req.body;
    if (typeof username === 'string') username = username.trim();
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
    
    try {
        const existingUser = await dbOps.users().findOne({ username });
        if (existingUser) return res.status(400).json({ error: 'User already exists' });

        const passwordHash = await bcrypt.hash(password, 10);
        await dbOps.users().insertOne({
            username,
            passwordHash,
            xp: 0,
            level: 1
        });
        res.status(201).json({ message: 'User created' });
    } catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/auth/login', async (req: Request, res: Response) => {
    let { username, password } = req.body;
    if (typeof username === 'string') username = username.trim();

    try {
        const user = await dbOps.users().findOne({ username });
        if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const token = jwt.sign({ id: user._id?.toString(), username: user.username }, SECRET_KEY, { expiresIn: '1h' });
        res.json({ token, username: user.username });
    } catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

// --- Profile Route ---
app.get('/api/profile', authenticateToken, async (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    try {
        const user = await dbOps.users().findOne({ _id: userId });
        if (!user) return res.status(404).json({ error: 'User not found' });
        
        const friendCount = await dbOps.friendships().countDocuments({
            $or: [{ userId }, { friendId: userId }],
            status: 'accepted'
        });
        
        res.json({
            username: user.username,
            xp: user.xp,
            level: user.level,
            avatarUrl: user.avatarUrl,
            friendCount
        });
    } catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

// --- Friends Routes ---
app.get('/api/users/search', authenticateToken, async (req: Request, res: Response) => {
    const q = getStringParam(req.query.q);
    const currentUserId = (req as any).user.id;
    if (!q) return res.json([]);

    try {
        const users = await dbOps.users().find({
            username: { $regex: q, $options: 'i' },
            _id: { $ne: currentUserId }
        }).limit(10).toArray();

        res.json(users.map(u => ({ id: u._id, username: u.username, level: u.level, avatarUrl: u.avatarUrl })));
    } catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/friends/add', authenticateToken, async (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    const { friendId } = req.body;
    if (!friendId) return res.status(400).json({ error: 'Friend ID required' });
    if (typeof friendId !== 'string') return res.status(400).json({ error: 'Invalid friend ID' });
    const friendObjectId = new ObjectId(friendId);
    if (userId.equals(friendObjectId)) return res.status(400).json({ error: 'Cannot add yourself' });

    try {
        const friend = await dbOps.users().findOne({ _id: friendObjectId });
        if (!friend) return res.status(404).json({ error: 'User not found' });

        const existing = await dbOps.friendships().findOne({
            $or: [
                { userId, friendId: friendObjectId },
                { userId: friendObjectId, friendId: userId }
            ]
        });
        if (existing) return res.status(400).json({ error: 'Request already sent or already friends' });

        await dbOps.friendships().insertOne({ userId, friendId: friendObjectId, status: 'pending' });
        res.json({ message: 'Friend request sent' });
    } catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/api/friends', authenticateToken, async (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    try {
        const friendships = await dbOps.friendships().find({
            $or: [{ userId }, { friendId: userId }],
            status: 'accepted'
        }).toArray();

        const friendIds = friendships.map(f => f.userId.equals(userId) ? f.friendId : f.userId);
        const friends = await dbOps.users().find({ _id: { $in: friendIds } }).toArray();
        
        res.json(friends.map(f => ({ id: f._id, username: f.username, level: f.level, xp: f.xp, avatarUrl: f.avatarUrl })));
    } catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/api/friends/pending', authenticateToken, async (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    try {
        const pending = await dbOps.friendships().find({ friendId: userId, status: 'pending' }).toArray();
        const requesterIds = pending.map(p => p.userId);
        const users = await dbOps.users().find({ _id: { $in: requesterIds } }).toArray();
        res.json(users.map(u => ({ id: u._id, username: u.username, level: u.level, avatarUrl: u.avatarUrl })));
    } catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/friends/accept', authenticateToken, async (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    const { friendId } = req.body;
    if (!friendId) return res.status(400).json({ error: 'Friend ID required' });
    if (typeof friendId !== 'string') return res.status(400).json({ error: 'Invalid friend ID' });
    const requesterId = new ObjectId(friendId);

    try {
        const result = await dbOps.friendships().updateOne(
            { userId: requesterId, friendId: userId, status: 'pending' },
            { $set: { status: 'accepted' } }
        );
        if (result.matchedCount === 0) return res.status(404).json({ error: 'Request not found' });
        res.json({ message: 'Friend request accepted' });
    } catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/api/friends/:id/tasks', authenticateToken, async (req: Request, res: Response) => {
    if (typeof req.params.id !== 'string') return res.status(400).json({ error: 'Invalid ID' });
    const friendId = new ObjectId(req.params.id);
    const userId = (req as any).user.id;

    try {
        const isFriend = await dbOps.friendships().findOne({
            $or: [
                { userId, friendId, status: 'accepted' },
                { userId: friendId, friendId: userId, status: 'accepted' }
            ]
        });
        if (!isFriend) return res.status(403).json({ error: 'You are not friends with this user' });

        const tasks = await dbOps.tasks().find({ userId: friendId, isPublic: true }).sort({ createdAt: -1 }).toArray();
        res.json(tasks.map(t => ({ id: t._id, text: t.text, completed: t.completed, isPublic: t.isPublic, createdAt: t.createdAt })));
    } catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

// --- Task Routes ---
app.get('/api/tasks', authenticateToken, async (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    try {
        const userTasks = await dbOps.tasks().find({ userId }).toArray();
        res.json(userTasks.map(t => ({ id: t._id, text: t.text, completed: t.completed, isPublic: t.isPublic })));
    } catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/api/tasks/public', async (req: Request, res: Response) => {
    try {
        const publicTasks = await dbOps.tasks().aggregate([
            { $match: { isPublic: true } },
            { $lookup: { from: 'users', localField: 'userId', foreignField: '_id', as: 'user' } },
            { $unwind: '$user' }
        ]).toArray();
        
        res.json(publicTasks.map(t => ({
            id: t._id,
            text: t.text,
            completed: t.completed,
            isPublic: t.isPublic,
            username: t.user?.username || 'Unknown',
            avatarUrl: t.user?.avatarUrl
        })));
    } catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/tasks', authenticateToken, async (req: Request, res: Response) => {
    const { text, isPublic } = req.body;
    const userId = (req as any).user.id;
    if (!text) return res.status(400).json({ error: 'Task text is required' });

    try {
        const result = await dbOps.tasks().insertOne({
            userId,
            text,
            completed: false,
            isPublic: !!isPublic,
            createdAt: new Date()
        });
        res.status(201).json({ id: result.insertedId, text, completed: false, isPublic });
    } catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.patch('/api/tasks/:id', authenticateToken, async (req: Request, res: Response) => {
    if (typeof req.params.id !== 'string') return res.status(400).json({ error: 'Invalid ID' });
    const taskId = new ObjectId(req.params.id);
    const userId = (req as any).user.id;
    
    try {
        const task = await dbOps.tasks().findOne({ _id: taskId, userId });
        if (!task) return res.status(404).json({ error: 'Task not found or unauthorized' });

        const newCompletedStatus = !task.completed;
        await dbOps.tasks().updateOne({ _id: taskId }, { $set: { completed: newCompletedStatus } });

        const xpChange = newCompletedStatus ? 100 : -100;
        const user = await dbOps.users().findOne({ _id: userId });
        if (user) {
            const newXp = Math.max(0, user.xp + xpChange);
            const newLevel = calculateLevel(newXp);
            await dbOps.users().updateOne({ _id: userId }, { $set: { xp: newXp, level: newLevel } });
        }

        res.json({ ...task, completed: newCompletedStatus });
    } catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.delete('/api/tasks/:id', authenticateToken, async (req: Request, res: Response) => {
    if (typeof req.params.id !== 'string') return res.status(400).json({ error: 'Invalid ID' });
    const taskId = new ObjectId(req.params.id);
    const userId = (req as any).user.id;
    
    try {
        const result = await dbOps.tasks().deleteOne({ _id: taskId, userId });
        if (result.deletedCount === 0) return res.status(404).json({ error: 'Task not found or unauthorized' });
        res.status(204).send();
    } catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

if (require.main === module || process.env.NODE_ENV !== 'production') {
    syncDatabase().then(() => {
        app.listen(port, () => console.log(`Server running at http://localhost:${port}`));
    }).catch(err => console.error('Failed to sync database:', err));
}

export default app;
