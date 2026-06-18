import { Sequelize, DataTypes, Model } from 'sequelize';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();

const dbUrl = process.env.DATABASE_URL;

if (dbUrl) {
    console.log('Using DATABASE_URL for connection');
} else {
    console.log(`Connecting to database with:
        Host: ${process.env.DB_HOST || 'localhost'}
        Port: ${process.env.DB_PORT || '3306'}
        User: ${process.env.DB_USER || 'root'}
        DB: ${process.env.DB_NAME || 'todo_app'}
        Dialect: ${process.env.DB_DIALECT || 'mysql'}
    `);
}

const sequelize = dbUrl 
    ? new Sequelize(dbUrl, {
        dialect: (process.env.DB_DIALECT as any) || 'mysql',
        logging: false,
        dialectOptions: process.env.DB_DIALECT === 'postgres' ? {
            ssl: {
                rejectUnauthorized: false
            }
        } : {}
    })
    : new Sequelize(
        process.env.DB_NAME || 'todo_app',
        process.env.DB_USER || 'root',
        process.env.DB_PASSWORD || '',
        {
            host: process.env.DB_HOST || 'localhost',
            port: parseInt(process.env.DB_PORT || '3306'),
            dialect: (process.env.DB_DIALECT as any) || 'mysql',
            logging: false,
        }
    );

export class User extends Model {
    declare id: number;
    declare username: string;
    declare passwordHash: string;
    declare xp: number;
    declare level: number;
    declare avatarUrl: string;
}

User.init({
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
    },
    username: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
    },
    passwordHash: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    xp: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
    },
    level: {
        type: DataTypes.INTEGER,
        defaultValue: 1,
    },
    avatarUrl: {
        type: DataTypes.STRING,
        allowNull: true,
    },
}, {
    sequelize,
    modelName: 'user',
});

export class Task extends Model {
    declare id: number;
    declare userId: number;
    declare text: string;
    declare completed: boolean;
    declare isPublic: boolean;
}

Task.init({
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
    },
    userId: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    text: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    completed: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
    },
    isPublic: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
    },
}, {
    sequelize,
    modelName: 'task',
});

export class Friendship extends Model {
    declare id: number;
    declare userId: number;
    declare friendId: number;
    declare status: 'pending' | 'accepted';
}

Friendship.init({
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
    },
    userId: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    friendId: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    status: {
        type: DataTypes.ENUM('pending', 'accepted'),
        defaultValue: 'pending',
    },
}, {
    sequelize,
    modelName: 'friendship',
});

// Relationships
User.hasMany(Task, { foreignKey: 'userId' });
Task.belongsTo(User, { foreignKey: 'userId' });

User.belongsToMany(User, { 
    as: 'friends', 
    through: Friendship, 
    foreignKey: 'userId', 
    otherKey: 'friendId' 
});

export const syncDatabase = async () => {
    try {
        await sequelize.authenticate();
        console.log('Connection to database has been established successfully.');
        await sequelize.sync({ alter: true });
        console.log('Database synchronized.');
    } catch (error) {
        console.error('Unable to connect to the database:', error);
        throw error;
    }
};

export default sequelize;
