document.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = '/login.html';
        return;
    }

    const taskInput = document.getElementById('taskInput');
    const publicToggle = document.getElementById('publicToggle');
    const addBtn = document.getElementById('addBtn');
    const taskList = document.getElementById('taskList');
    const displayUsername = document.getElementById('displayUsername');
    const logoutBtn = document.getElementById('logoutBtn');
    const themeToggle = document.getElementById('themeToggle');
    const tabs = document.querySelectorAll('.tab');
    const inputContainer = document.getElementById('inputContainer');

    let currentTab = 'my';
    displayUsername.innerText = localStorage.getItem('username');

    // --- Theme Logic ---
    if (localStorage.getItem('theme') === 'dark') {
        document.body.classList.add('dark-theme');
    }

    themeToggle.onclick = () => {
        document.body.classList.toggle('dark-theme');
        localStorage.setItem('theme', document.body.classList.contains('dark-theme') ? 'dark' : 'light');
    };

    // --- Logout Logic ---
    logoutBtn.onclick = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('username');
        window.location.href = '/login.html';
    };

    // --- Tab Logic ---
    tabs.forEach(tab => {
        tab.onclick = () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            currentTab = tab.dataset.tab;
            
            // Hide input container if on public feed
            inputContainer.style.display = currentTab === 'public' ? 'none' : 'flex';
            
            fetchTasks();
        };
    });

    // --- API Calls ---
    async function fetchTasks() {
        const endpoint = currentTab === 'my' ? '/api/tasks' : '/api/tasks/public';
        const headers = currentTab === 'my' ? { 'Authorization': `Bearer ${token}` } : {};

        const response = await fetch(endpoint, { headers });
        if (response.status === 401 || response.status === 403) {
            logoutBtn.onclick();
            return;
        }
        const tasks = await response.json();
        renderTasks(tasks);
    }

    async function addTask() {
        const text = taskInput.value.trim();
        const isPublic = publicToggle.checked;
        if (!text) return;

        const response = await fetch('/api/tasks', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ text, isPublic })
        });

        if (response.ok) {
            taskInput.value = '';
            publicToggle.checked = false;
            fetchTasks();
        }
    }

    async function toggleTask(id) {
        if (currentTab !== 'my') return;
        const response = await fetch(`/api/tasks/${id}`, {
            method: 'PATCH',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.ok) fetchTasks();
    }

    async function deleteTask(id, element) {
        const response = await fetch(`/api/tasks/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.ok) {
            element.style.animation = 'slideOut 0.3s ease-in forwards';
            setTimeout(() => fetchTasks(), 300);
        }
    }

    function renderTasks(tasks) {
        taskList.innerHTML = '';
        tasks.forEach((task, index) => {
            const li = document.createElement('li');
            li.className = `task-item animate-in ${task.completed ? 'completed' : ''}`;
            li.style.animationDelay = `${index * 0.05}s`;
            
            const isOwner = currentTab === 'my';

            li.innerHTML = `
                <div class="task-info">
                    <div class="checkbox"></div>
                    <div class="task-meta">
                        <span>${task.text}</span>
                        ${task.isPublic ? `<small>By: ${task.username || 'You'}</small>` : ''}
                    </div>
                </div>
                ${isOwner ? `
                <button class="delete-btn">
                    <svg viewBox="0 0 24 24" width="18" height="18">
                        <path fill="currentColor" d="M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19V4M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z" />
                    </svg>
                </button>` : ''}
            `;

            if (isOwner) {
                li.onclick = () => toggleTask(task.id);
                li.querySelector('.delete-btn').onclick = (e) => {
                    e.stopPropagation();
                    deleteTask(task.id, li);
                };
            } else {
                li.style.cursor = 'default';
            }

            taskList.appendChild(li);
        });
    }

    addBtn.onclick = addTask;
    taskInput.onkeypress = (e) => { if (e.key === 'Enter') addTask(); };

    fetchTasks();
});
