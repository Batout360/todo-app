import { Sequelize, DataTypes, Model } from 'sequelize';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();

const dbUrl = process.env.DATABASE_URL;

if (dbUrl) {
    console.log('Using DATABASE_URL for connection');
} else {
    console.log(`Connecting to database with:
        Host: ${process.env.DB_HOST || 'dpg-d8lcmhq8qa3s73a2adig-a'}
        Port: ${process.env.DB_PORT || '5432'}
        User: ${process.env.DB_USER || 'todo_app_iw5f_user'}
        DB: ${process.env.DB_NAME || 'todo_app_iw5f'}
        Dialect: ${process.env.DB_DIALECT || 'postgres'}
    `);
}

const sequelize = dbUrl 
    ? new Sequelize(dbUrl, {
        dialect: (process.env.DB_DIALECT as any) || 'postgres',
        logging: false,
        dialectOptions: {
            ssl: {
                rejectUnauthorized: false
            }
        }
    })
    : new Sequelize(
        process.env.DB_NAME || 'todo_app_iw5f',
        process.env.DB_USER || 'todo_app_iw5f_user',
        process.env.DB_PASSWORD || '0pOkuNNZbRIlUNumJqExg0CCkMRqp7XQ',
        {
            host: process.env.DB_HOST || 'dpg-d8lcmhq8qa3s73a2adig-a',
            port: parseInt(process.env.DB_PORT || '5432'),
            dialect: (process.env.DB_DIALECT as any) || 'postgres',
            logging: false,
            dialectOptions: {
                ssl: {
                    rejectUnauthorized: false
                }
            }
        }
    );

export class User extends Model {
    declare id: number;
    declare username: string;
    declare passwordHash: string;
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

// Relationships
User.hasMany(Task, { foreignKey: 'userId' });
Task.belongsTo(User, { foreignKey: 'userId' });

export const syncDatabase = async () => {
    try {
        await sequelize.authenticate();
        console.log('Connection to database has been established successfully.');
        await sequelize.sync();
        console.log('Database synchronized.');
    } catch (error) {
        console.error('Unable to connect to the database:', error);
        throw error;
    }
};

export default sequelize;
