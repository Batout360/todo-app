# Todo App

A simple, modern Todo application built with Node.js, Express, and TypeScript.

## Features
- Add tasks
- Mark tasks as complete/incomplete
- Delete tasks
- In-memory storage (resets on server restart)
- Modern, responsive UI

## Tech Stack
- **Backend**: Node.js, Express, TypeScript (ES Modules)
- **Frontend**: HTML5, CSS3, Vanilla JavaScript

## Setup & Run

### Prerequisites
- Node.js (v18+ recommended)
- npm

### Installation
```bash
npm install
```

### Development
Start the server with auto-reload:
```bash
npm run dev
```

### Production
Build and start the server:
```bash
npm run build
npm start
```

## API Endpoints
- `GET /api/tasks`: Get all tasks.
- `POST /api/tasks`: Add a new task (JSON body: `{ "text": "Task name" }`).
- `PATCH /api/tasks/:id`: Toggle task completion.
- `DELETE /api/tasks/:id`: Delete a task.
