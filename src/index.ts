import express, { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { syncDatabase, User, Task, Friendship } from './db';
import { Op } from 'sequelize';
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

// Serve static files from 'public' directory
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

// --- Database Sync Middleware (for Serverless) ---
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

// --- Helper for Leveling ---
const calculateLevel = (xp: number) => Math.floor(xp / 500) + 1;

// --- Healthcheck ---
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
        (req as any).user = user;
        next();
    });
};

// --- Avatar View Route (Proxy) ---
app.get('/api/avatar/view', async (req: Request, res: Response) => {
    const pathname = req.query.pathname as string;
    if (!pathname) {
        return res.status(400).json({ error: 'Missing pathname' });
    }

    try {
        const result = await get(pathname, { access: 'private' });
        
        if (!result || result.statusCode !== 200) {
            return res.status(result?.statusCode || 404).send('Not found');
        }

        const contentType = result.blob.contentType || 'application/octet-stream';
        res.setHeader('Content-Type', contentType);
        res.setHeader('X-Content-Type-Options', 'nosniff');
        
        if (result.stream) {
            const nodeStream = Readable.fromWeb(result.stream as any);
            nodeStream.pipe(res);
        } else {
            res.status(404).send('No content available');
        }

    } catch (err) {
        console.error('Error fetching blob:', err);
        res.status(404).send('Not found');
    }
});

// --- Vercel Blob Webhook Route ---
app.post('/api/blob/webhook', express.text({ type: 'application/json' }), async (req: Request, res: Response) => {
    const signature = req.headers['x-vercel-signature'] as string;
    const rawBody = req.body as string;

    if (!signature || !verifyVercelSignature(rawBody, signature)) {
        console.error('Webhook verification failed');
        return res.status(401).send('Unauthorized');
    }

    try {
        const event = JSON.parse(rawBody);
        if (event.type === 'blob.created') {
            const pathname = event.payload.blob.pathname;
            const match = pathname.match(/avatars\/(\d+)-/);
            const userId = match ? match[1] : null;

            if (userId) {
                const user = await User.findByPk(userId);
                if (user) {
                    user.avatarUrl = `/api/avatar/view?pathname=${pathname}`;
                    await user.save();
                    console.log(`Database updated via webhook for user ${userId}`);
                }
            }
        }

        res.status(200).send('OK');
    } catch (err) {
        console.error('Error processing webhook:', err);
        res.status(500).send('Internal server error');
    }
});

// --- Avatar Upload Route ---
app.post('/api/avatar/upload', authenticateToken, express.raw({ type: 'image/*', limit: '4.5mb' }), async (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    const filename = req.query.filename as string;

    if (!filename || !req.body) {
        return res.status(400).json({ error: 'Filename and image data required' });
    }

    try {
        const blob = await put(`avatars/${userId}-${filename}`, req.body, {
            access: 'private',
            addRandomSuffix: true
        });

        const user = await User.findByPk(userId);
        let avatarUrl = '';
        if (user) {
            avatarUrl = `/api/avatar/view?pathname=${blob.pathname}`;
            user.avatarUrl = avatarUrl;
            await user.save();
        }

        res.json({ ...blob, avatarUrl });
    } catch (err) {
        console.error('Upload error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// --- Auth Routes ---
app.post('/api/auth/register', async (req: Request, res: Response) => {
    let { username, password } = req.body;
    if (typeof username === 'string') username = username.trim();
    
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
    
    try {
        const existingUser = await User.findOne({ where: { username } });
        if (existingUser) {
            return res.status(400).json({ error: 'User already exists' });
        }

        const passwordHash = await bcrypt.hash(password, 10);
        await User.create({ username, passwordHash });
        res.status(201).json({ message: 'User created' });
    } catch (err) {
        console.error(`Register error:`, err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/auth/login', async (req: Request, res: Response) => {
    let { username, password } = req.body;
    if (typeof username === 'string') username = username.trim();

    try {
        const user = await User.findOne({ where: { username } });
        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const isMatch = await bcrypt.compare(password, user.passwordHash);
        if (!isMatch) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const token = jwt.sign({ id: user.id, username: user.username }, SECRET_KEY, { expiresIn: '1h' });
        res.json({ token, username: user.username });
    } catch (err) {
        console.error(`Login error:`, err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// --- Profile Route ---
app.get('/api/profile', authenticateToken, async (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    try {
        const user = await User.findByPk(userId);
        if (!user) return res.status(404).json({ error: 'User not found' });
        
        const friendCount = await Friendship.count({ where: { [Op.or]: [{ userId }, { friendId: userId }], status: 'accepted' } });
        
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
    const { q } = req.query;
    const currentUserId = (req as any).user.id;
    
    if (!q) return res.json([]);

    try {
        const users = await User.findAll({
            where: {
                username: { [Op.like]: `%${q}%` },
                id: { [Op.ne]: currentUserId }
            },
            attributes: ['id', 'username', 'level', 'avatarUrl'],
            limit: 10
        });
        res.json(users);
    } catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/friends/add', authenticateToken, async (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    const { friendId } = req.body;

    if (!friendId) return res.status(400).json({ error: 'Friend ID required' });
    if (userId === friendId) return res.status(400).json({ error: 'Cannot add yourself' });

    try {
        const friend = await User.findByPk(friendId);
        if (!friend) return res.status(404).json({ error: 'User not found' });

        const existing = await Friendship.findOne({ 
            where: { 
                [Op.or]: [
                    { userId, friendId },
                    { userId: friendId, friendId: userId }
                ]
            } 
        });
        if (existing) return res.status(400).json({ error: 'Request already sent or already friends' });

        await Friendship.create({ userId, friendId, status: 'pending' });

        res.json({ message: 'Friend request sent' });
    } catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/api/friends', authenticateToken, async (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    try {
        const friendships = await Friendship.findAll({
            where: {
                [Op.or]: [{ userId }, { friendId: userId }],
                status: 'accepted'
            }
        });

        const friendIds = friendships.map(f => f.userId === userId ? f.friendId : f.userId);
        const friends = await User.findAll({
            where: { id: friendIds },
            attributes: ['id', 'username', 'level', 'xp', 'avatarUrl']
        });
        
        res.json(friends);
    } catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/api/friends/pending', authenticateToken, async (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    try {
        const pending = await Friendship.findAll({
            where: { friendId: userId, status: 'pending' }
        });

        const requesterIds = pending.map(p => p.userId);
        const users = await User.findAll({
            where: { id: requesterIds },
            attributes: ['id', 'username', 'level', 'avatarUrl']
        });
        
        res.json(users);
    } catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/friends/accept', authenticateToken, async (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    const { friendId } = req.body;

    if (!friendId) return res.status(400).json({ error: 'Friend ID required' });

    try {
        const friendship = await Friendship.findOne({
            where: { userId: friendId, friendId: userId, status: 'pending' }
        });

        if (!friendship) return res.status(404).json({ error: 'Request not found' });

        friendship.status = 'accepted';
        await friendship.save();

        res.json({ message: 'Friend request accepted' });
    } catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/api/friends/:id/tasks', authenticateToken, async (req: Request, res: Response) => {
    const friendId = parseInt(req.params.id as string);
    const userId = (req as any).user.id;

    try {
        const isFriend = await Friendship.findOne({ 
            where: { 
                [Op.or]: [
                    { userId, friendId, status: 'accepted' },
                    { userId: friendId, friendId: userId, status: 'accepted' }
                ]
            } 
        });
        if (!isFriend) return res.status(403).json({ error: 'You are not friends with this user' });

        const tasks = await Task.findAll({
            where: { userId: friendId, isPublic: true },
            order: [['createdAt', 'DESC']]
        });
        res.json(tasks);
    } catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

// --- Task Routes ---

app.get('/api/tasks', authenticateToken, async (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    try {
        const userTasks = await Task.findAll({ where: { userId } });
        res.json(userTasks);
    } catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/api/tasks/public', async (req: Request, res: Response) => {
    try {
        const publicTasks = await Task.findAll({
            where: { isPublic: true },
            include: [{ model: User, attributes: ['username', 'avatarUrl'] }]
        });
        
        const formattedTasks = publicTasks.map((t: any) => ({
            ...t.toJSON(),
            username: t.user?.username || 'Unknown',
            avatarUrl: t.user?.avatarUrl
        }));
        
        res.json(formattedTasks);
    } catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/tasks', authenticateToken, async (req: Request, res: Response) => {
    const { text, isPublic } = req.body;
    const userId = (req as any).user.id;

    if (!text) return res.status(400).json({ error: 'Task text is required' });

    try {
        const newTask = await Task.create({
            userId,
            text,
            completed: false,
            isPublic: !!isPublic
        });
        res.status(201).json(newTask);
    } catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.patch('/api/tasks/:id', authenticateToken, async (req: Request, res: Response) => {
    const id = parseInt(req.params.id as string);
    const userId = (req as any).user.id;
    
    try {
        const task = await Task.findOne({ where: { id, userId } });
        if (!task) return res.status(404).json({ error: 'Task not found or unauthorized' });

        const wasCompleted = task.completed;
        task.completed = !task.completed;
        await task.save();

        if (!wasCompleted && task.completed) {
            const user = await User.findByPk(userId);
            if (user) {
                user.xp += 100;
                user.level = calculateLevel(user.xp);
                await user.save();
            }
        } else if (wasCompleted && !task.completed) {
            const user = await User.findByPk(userId);
            if (user) {
                user.xp = Math.max(0, user.xp - 100);
                user.level = calculateLevel(user.xp);
                await user.save();
            }
        }

        res.json(task);
    } catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.delete('/api/tasks/:id', authenticateToken, async (req: Request, res: Response) => {
    const id = parseInt(req.params.id as string);
    const userId = (req as any).user.id;
    
    try {
        const deletedCount = await Task.destroy({ where: { id, userId } });
        if (deletedCount === 0) {
            return res.status(404).json({ error: 'Task not found or unauthorized' });
        }
        res.status(204).send();
    } catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Start server if not running as a Vercel function
if (require.main === module || process.env.NODE_ENV !== 'production') {
    syncDatabase().then(() => {
        app.listen(port, () => {
            console.log(`Server running at http://localhost:${port}`);
        });
    }).catch(err => {
        console.error('Failed to sync database:', err);
    });
}

export default app;
