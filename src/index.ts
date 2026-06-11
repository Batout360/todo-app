import express, { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { syncDatabase, User, Task } from './db';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;
const SECRET_KEY = process.env.JWT_SECRET || 'your-very-secret-key';

app.use(express.json());
app.use(express.static('public'));

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

// --- Auth Routes ---
app.post('/api/auth/register', async (req: Request, res: Response) => {
    let { username, password } = req.body;
    if (typeof username === 'string') username = username.trim();
    
    console.log(`Register attempt for: "${username}"`);
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
    
    try {
        const existingUser = await User.findOne({ where: { username } });
        if (existingUser) {
            console.log(`Register failed: User "${username}" already exists`);
            return res.status(400).json({ error: 'User already exists' });
        }

        const passwordHash = await bcrypt.hash(password, 10);
        await User.create({ username, passwordHash });
        console.log(`Register success: User "${username}" created`);
        res.status(201).json({ message: 'User created' });
    } catch (err) {
        console.error(`Register error for "${username}":`, err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/auth/login', async (req: Request, res: Response) => {
    let { username, password } = req.body;
    if (typeof username === 'string') username = username.trim();

    console.log(`Login attempt for: "${username}"`);
    try {
        const user = await User.findOne({ where: { username } });
        if (!user) {
            console.log(`Login failed: User "${username}" not found`);
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const isMatch = await bcrypt.compare(password, user.passwordHash);
        if (!isMatch) {
            console.log(`Login failed: Password mismatch for "${username}"`);
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        console.log(`Login success: "${username}"`);
        const token = jwt.sign({ id: user.id, username: user.username }, SECRET_KEY, { expiresIn: '1h' });
        res.json({ token, username: user.username });
    } catch (err) {
        console.error(`Login error for "${username}":`, err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// --- Task Routes ---

// Get my tasks
app.get('/api/tasks', authenticateToken, async (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    try {
        const userTasks = await Task.findAll({ where: { userId } });
        res.json(userTasks);
    } catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get public tasks
app.get('/api/tasks/public', async (req: Request, res: Response) => {
    try {
        const publicTasks = await Task.findAll({
            where: { isPublic: true },
            include: [{ model: User, attributes: ['username'] }]
        });
        
        const formattedTasks = publicTasks.map((t: any) => ({
            ...t.toJSON(),
            username: t.user?.username || 'Unknown'
        }));
        
        res.json(formattedTasks);
    } catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Add a new task
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

// Toggle task completion
app.patch('/api/tasks/:id', authenticateToken, async (req: Request, res: Response) => {
    const id = parseInt(req.params.id as string);
    const userId = (req as any).user.id;
    
    try {
        const task = await Task.findOne({ where: { id, userId } });
        if (!task) return res.status(404).json({ error: 'Task not found or unauthorized' });

        task.completed = !task.completed;
        await task.save();
        res.json(task);
    } catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Delete a task
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

// Initialize DB and start server
syncDatabase().then(() => {
    app.listen(port, () => {
        console.log(`Server running at http://localhost:${port}`);
    });
}).catch(err => {
    console.error('Failed to sync database:', err);
});
