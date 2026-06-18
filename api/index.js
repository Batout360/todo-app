"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const dotenv_1 = __importDefault(require("dotenv"));
const db_1 = require("../src/db");
const sequelize_1 = require("sequelize");
const blob_1 = require("@vercel/blob");
const stream_1 = require("stream");
dotenv_1.default.config();
const app = (0, express_1.default)();
const SECRET_KEY = process.env.JWT_SECRET || 'your-very-secret-key';
app.use(express_1.default.json());
// --- Database Sync Middleware ---
let isSynced = false;
app.use(async (req, res, next) => {
    if (!isSynced) {
        try {
            await (0, db_1.syncDatabase)();
            isSynced = true;
        }
        catch (err) {
            console.error('DB Sync Error:', err);
        }
    }
    next();
});
// --- Helper for Leveling ---
const calculateLevel = (xp) => Math.floor(xp / 500) + 1;
// --- Healthcheck ---
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok' });
});
// --- Auth Middleware ---
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token)
        return res.status(401).json({ error: 'Unauthorized' });
    jsonwebtoken_1.default.verify(token, SECRET_KEY, (err, user) => {
        if (err)
            return res.status(403).json({ error: 'Forbidden' });
        req.user = user;
        next();
    });
};
// --- Avatar View Route (Proxy) ---
app.get('/api/avatar/view', async (req, res) => {
    // Optional: Authenticate request here if needed
    const pathname = req.query.pathname;
    if (!pathname) {
        return res.status(400).json({ error: 'Missing pathname' });
    }
    try {
        const result = await (0, blob_1.get)(pathname, { access: 'private' });
        if (result.statusCode !== 200) {
            return res.status(result.statusCode).send('Not found');
        }
        res.setHeader('Content-Type', result.blob.contentType);
        res.setHeader('X-Content-Type-Options', 'nosniff');
        if (result.stream) {
            // Convert Web ReadableStream to Node stream and pipe it
            const nodeStream = stream_1.Readable.fromWeb(result.stream);
            nodeStream.pipe(res);
        }
        else {
            res.status(404).send('No content available');
        }
    }
    catch (err) {
        console.error('Error fetching blob:', err);
        res.status(404).send('Not found');
    }
});
// --- Avatar Upload Route ---
app.post('/api/avatar/upload', authenticateToken, express_1.default.raw({ type: 'image/*', limit: '4.5mb' }), async (req, res) => {
    const userId = req.user.id;
    const filename = req.query.filename;
    if (!filename || !req.body) {
        return res.status(400).json({ error: 'Filename and image data required' });
    }
    try {
        const blob = await (0, blob_1.put)(filename, req.body, {
            access: 'private',
        });
        const user = await db_1.User.findByPk(userId);
        let avatarUrl = '';
        if (user) {
            // Store the proxy URL
            avatarUrl = `/api/avatar/view?pathname=${blob.pathname}`;
            user.avatarUrl = avatarUrl;
            await user.save();
        }
        res.json({ ...blob, avatarUrl });
    }
    catch (err) {
        console.error('Upload error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// --- Auth Routes ---
app.post('/api/auth/register', async (req, res) => {
    let { username, password } = req.body;
    if (typeof username === 'string')
        username = username.trim();
    console.log(`Register attempt for: "${username}"`);
    if (!username || !password)
        return res.status(400).json({ error: 'Username and password required' });
    try {
        const existingUser = await db_1.User.findOne({ where: { username } });
        if (existingUser) {
            console.log(`Register failed: User "${username}" already exists`);
            return res.status(400).json({ error: 'User already exists' });
        }
        const passwordHash = await bcryptjs_1.default.hash(password, 10);
        await db_1.User.create({ username, passwordHash });
        console.log(`Register success: User "${username}" created`);
        res.status(201).json({ message: 'User created' });
    }
    catch (err) {
        console.error(`Register error for "${username}":`, err);
        res.status(500).json({ error: 'Internal server error' });
    }
});
app.post('/api/auth/login', async (req, res) => {
    let { username, password } = req.body;
    if (typeof username === 'string')
        username = username.trim();
    console.log(`Login attempt for: "${username}"`);
    try {
        const user = await db_1.User.findOne({ where: { username } });
        if (!user) {
            console.log(`Login failed: User "${username}" not found`);
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        const isMatch = await bcryptjs_1.default.compare(password, user.passwordHash);
        if (!isMatch) {
            console.log(`Login failed: Password mismatch for "${username}"`);
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        console.log(`Login success: "${username}"`);
        const token = jsonwebtoken_1.default.sign({ id: user.id, username: user.username }, SECRET_KEY, { expiresIn: '1h' });
        res.json({ token, username: user.username });
    }
    catch (err) {
        console.error(`Login error for "${username}":`, err);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// --- Profile Route ---
app.get('/api/profile', authenticateToken, async (req, res) => {
    const userId = req.user.id;
    try {
        const user = await db_1.User.findByPk(userId);
        if (!user)
            return res.status(404).json({ error: 'User not found' });
        const friendCount = await db_1.Friendship.count({ where: { userId } });
        res.json({
            username: user.username,
            xp: user.xp,
            level: user.level,
            avatarUrl: user.avatarUrl,
            friendCount
        });
    }
    catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
});
// --- Friends Routes ---
// Search users
app.get('/api/users/search', authenticateToken, async (req, res) => {
    const { q } = req.query;
    const currentUserId = req.user.id;
    if (!q)
        return res.json([]);
    try {
        const users = await db_1.User.findAll({
            where: {
                username: { [sequelize_1.Op.like]: `%${q}%` },
                id: { [sequelize_1.Op.ne]: currentUserId }
            },
            attributes: ['id', 'username', 'level', 'avatarUrl'],
            limit: 10
        });
        res.json(users);
    }
    catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
});
// Add friend (send request)
app.post('/api/friends/add', authenticateToken, async (req, res) => {
    const userId = req.user.id;
    const { friendId } = req.body;
    if (!friendId)
        return res.status(400).json({ error: 'Friend ID required' });
    if (userId === friendId)
        return res.status(400).json({ error: 'Cannot add yourself' });
    try {
        const friend = await db_1.User.findByPk(friendId);
        if (!friend)
            return res.status(404).json({ error: 'User not found' });
        const existing = await db_1.Friendship.findOne({
            where: {
                [sequelize_1.Op.or]: [
                    { userId, friendId },
                    { userId: friendId, friendId: userId }
                ]
            }
        });
        if (existing)
            return res.status(400).json({ error: 'Request already sent or already friends' });
        await db_1.Friendship.create({ userId, friendId, status: 'pending' });
        res.json({ message: 'Friend request sent' });
    }
    catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
});
// List accepted friends
app.get('/api/friends', authenticateToken, async (req, res) => {
    const userId = req.user.id;
    try {
        const friendships = await db_1.Friendship.findAll({
            where: {
                [sequelize_1.Op.or]: [{ userId }, { friendId: userId }],
                status: 'accepted'
            }
        });
        const friendIds = friendships.map(f => f.userId === userId ? f.friendId : f.userId);
        const friends = await db_1.User.findAll({
            where: { id: friendIds },
            attributes: ['id', 'username', 'level', 'xp', 'avatarUrl']
        });
        res.json(friends);
    }
    catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
});
// List pending requests (incoming)
app.get('/api/friends/pending', authenticateToken, async (req, res) => {
    const userId = req.user.id;
    try {
        const pending = await db_1.Friendship.findAll({
            where: { friendId: userId, status: 'pending' }
        });
        const requesterIds = pending.map(p => p.userId);
        const users = await db_1.User.findAll({
            where: { id: requesterIds },
            attributes: ['id', 'username', 'level', 'avatarUrl']
        });
        res.json(users);
    }
    catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
});
// Accept friend request
app.post('/api/friends/accept', authenticateToken, async (req, res) => {
    const userId = req.user.id;
    const { friendId } = req.body;
    if (!friendId)
        return res.status(400).json({ error: 'Friend ID required' });
    try {
        const friendship = await db_1.Friendship.findOne({
            where: { userId: friendId, friendId: userId, status: 'pending' }
        });
        if (!friendship)
            return res.status(404).json({ error: 'Request not found' });
        friendship.status = 'accepted';
        await friendship.save();
        res.json({ message: 'Friend request accepted' });
    }
    catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
});
// Get friend tasks
app.get('/api/friends/:id/tasks', authenticateToken, async (req, res) => {
    const friendId = parseInt(req.params.id);
    const userId = req.user.id;
    try {
        // Verify friendship
        const isFriend = await db_1.Friendship.findOne({
            where: {
                [sequelize_1.Op.or]: [
                    { userId, friendId, status: 'accepted' },
                    { userId: friendId, friendId: userId, status: 'accepted' }
                ]
            }
        });
        if (!isFriend)
            return res.status(403).json({ error: 'You are not friends with this user' });
        const tasks = await db_1.Task.findAll({
            where: { userId: friendId, isPublic: true },
            order: [['createdAt', 'DESC']]
        });
        res.json(tasks);
    }
    catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
});
// --- Task Routes ---
// Get my tasks
app.get('/api/tasks', authenticateToken, async (req, res) => {
    const userId = req.user.id;
    try {
        const userTasks = await db_1.Task.findAll({ where: { userId } });
        res.json(userTasks);
    }
    catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
});
// Get public tasks
app.get('/api/tasks/public', async (req, res) => {
    try {
        const publicTasks = await db_1.Task.findAll({
            where: { isPublic: true },
            include: [{ model: db_1.User, attributes: ['username', 'avatarUrl'] }]
        });
        const formattedTasks = publicTasks.map((t) => ({
            ...t.toJSON(),
            username: t.user?.username || 'Unknown',
            avatarUrl: t.user?.avatarUrl
        }));
        res.json(formattedTasks);
    }
    catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
});
// Add a new task
app.post('/api/tasks', authenticateToken, async (req, res) => {
    const { text, isPublic } = req.body;
    const userId = req.user.id;
    if (!text)
        return res.status(400).json({ error: 'Task text is required' });
    try {
        const newTask = await db_1.Task.create({
            userId,
            text,
            completed: false,
            isPublic: !!isPublic
        });
        res.status(201).json(newTask);
    }
    catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
});
// Toggle task completion
app.patch('/api/tasks/:id', authenticateToken, async (req, res) => {
    const id = parseInt(req.params.id);
    const userId = req.user.id;
    try {
        const task = await db_1.Task.findOne({ where: { id, userId } });
        if (!task)
            return res.status(404).json({ error: 'Task not found or unauthorized' });
        const wasCompleted = task.completed;
        task.completed = !task.completed;
        await task.save();
        // Award XP if completed
        if (!wasCompleted && task.completed) {
            const user = await db_1.User.findByPk(userId);
            if (user) {
                user.xp += 100;
                user.level = calculateLevel(user.xp);
                await user.save();
            }
        }
        else if (wasCompleted && !task.completed) {
            // Optional: Remove XP if uncompleted
            const user = await db_1.User.findByPk(userId);
            if (user) {
                user.xp = Math.max(0, user.xp - 100);
                user.level = calculateLevel(user.xp);
                await user.save();
            }
        }
        res.json(task);
    }
    catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
});
// Delete a task
app.delete('/api/tasks/:id', authenticateToken, async (req, res) => {
    const id = parseInt(req.params.id);
    const userId = req.user.id;
    try {
        const deletedCount = await db_1.Task.destroy({ where: { id, userId } });
        if (deletedCount === 0) {
            return res.status(404).json({ error: 'Task not found or unauthorized' });
        }
        res.status(204).send();
    }
    catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
});
// Initialize DB (for local dev)
if (process.env.NODE_ENV !== 'production') {
    (0, db_1.syncDatabase)().then(() => {
        const port = process.env.PORT || 3000;
        app.listen(port, () => {
            console.log(`Server running at http://localhost:${port}`);
        });
    }).catch(err => {
        console.error('Failed to sync database:', err);
    });
}
exports.default = app;
//# sourceMappingURL=index.js.map