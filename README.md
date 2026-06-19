# Todo App

A modern, feature-rich Todo application built with Node.js, Express, Sequelize, and TypeScript.

## Features
- **Task Management**: Add, toggle, and delete tasks.
- **Privacy**: Tasks can be private or public.
- **Social**: Search users, send/accept friend requests, and view friends' public tasks.
- **XP & Leveling**: Earn 100 XP for each completed task and level up.
- **Profiles**: Personalized profiles with avatars (supported by Vercel Blob).
- **Modern UI**: Responsive design with dark/light theme support.

## Tech Stack
- **Backend**: Node.js, Express, Sequelize (SQL), TypeScript.
- **Database**: Supports MySQL, PostgreSQL, or any SQL DB via Sequelize.
- **Storage**: Vercel Blob for avatar storage.
- **Frontend**: HTML5, CSS3, Vanilla JavaScript.

## Deployed on Vercel and Database on MongoDB
- link- https://todo-app-six-wine-99.vercel.app/

## Setup & Run

### Environment Variables
Create a `.env` file in the root with:
```env
DATABASE_URL=your_sql_db_url
JWT_SECRET=your_jwt_secret
BLOB_READ_WRITE_TOKEN=your_vercel_blob_token
```

### Development
```bash
npm install
npm run dev
```

### Production
Build and start the server:
```bash
npm run build
npm start
```

### Database Check
```bash
npm run check-db
```
