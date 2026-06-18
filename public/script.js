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
    
    // Avatar elements
    const userAvatar = document.getElementById('userAvatar');
    const avatarInput = document.getElementById('avatarInput');

    // Stats elements
    const userLevel = document.getElementById('userLevel');
    const xpFill = document.getElementById('xpFill');
    const userXp = document.getElementById('userXp');

    // Friends elements
    const friendsContainer = document.getElementById('friendsContainer');
    const friendSearch = document.getElementById('friendSearch');
    const searchResults = document.getElementById('searchResults');
    const friendsList = document.getElementById('friendsList');
    const pendingRequests = document.getElementById('pendingRequests');
    const requestsList = document.getElementById('requestsList');

    let currentTab = 'my';
    let selectedFriendId = null;
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

    // --- Profile Logic ---
    async function updateProfile() {
        const response = await fetch('/api/profile', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.ok) {
            const data = await response.json();
            userLevel.innerText = `Lvl ${data.level}`;
            userXp.innerText = `${data.xp} XP`;
            const progress = (data.xp % 500) / 500 * 100;
            xpFill.style.width = `${progress}%`;
            
            if (data.avatarUrl) {
                userAvatar.src = data.avatarUrl;
            } else {
                userAvatar.src = `https://ui-avatars.com/api/?name=${data.username}&background=random`;
            }
        }
    }

    // --- Avatar Logic ---
    userAvatar.onclick = () => avatarInput.click();

    avatarInput.onchange = async () => {
        const file = avatarInput.files[0];
        if (!file) return;

        const response = await fetch(`/api/avatar/upload?filename=${file.name}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': file.type
            },
            body: file
        });

        if (response.ok) {
            const result = await response.json();
            userAvatar.src = result.avatarUrl;
            updateProfile();
        } else {
            alert('Upload failed');
        }
    };

    // --- Tab Logic ---
    tabs.forEach(tab => {
        tab.onclick = () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            currentTab = tab.dataset.tab;
            selectedFriendId = null;
            
            // UI Visibility
            inputContainer.style.display = currentTab === 'my' ? 'flex' : 'none';
            friendsContainer.style.display = currentTab === 'friends' ? 'flex' : 'none';
            taskList.style.display = currentTab === 'friends' ? 'none' : 'block';
            
            if (currentTab === 'friends') {
                fetchFriends();
                fetchPendingRequests();
            } else {
                fetchTasks();
            }
        };
    });

    // --- Friends Logic ---
    async function searchUsers(query) {
        if (!query) {
            searchResults.style.display = 'none';
            return;
        }
        const response = await fetch(`/api/users/search?q=${query}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const users = await response.json();
        renderSearchResults(users);
    }

    function renderSearchResults(users) {
        searchResults.innerHTML = '';
        if (users.length === 0) {
            searchResults.style.display = 'none';
            return;
        }
        users.forEach(user => {
            const div = document.createElement('div');
            div.className = 'search-item';
            const avatarSrc = user.avatarUrl || `https://ui-avatars.com/api/?name=${user.username}&background=random`;
            div.innerHTML = `
                <div style="display:flex; align-items:center; gap:10px">
                    <img src="${avatarSrc}" style="width:30px; height:30px; border-radius:50%">
                    <span>${user.username} (Lvl ${user.level})</span>
                </div>
                <button class="add-friend-btn" data-id="${user.id}">Add</button>
            `;
            div.querySelector('.add-friend-btn').onclick = (e) => {
                e.stopPropagation();
                addFriend(user.id);
            };
            searchResults.appendChild(div);
        });
        searchResults.style.display = 'block';
    }

    async function addFriend(friendId) {
        const response = await fetch('/api/friends/add', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ friendId })
        });
        if (response.ok) {
            friendSearch.value = '';
            searchResults.style.display = 'none';
            alert('Friend request sent!');
        } else {
            const data = await response.json();
            alert(data.error || 'Failed to send request');
        }
    }

    async function fetchPendingRequests() {
        const response = await fetch('/api/friends/pending', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const requests = await response.json();
        renderPendingRequests(requests);
    }

    function renderPendingRequests(requests) {
        if (requests.length === 0) {
            pendingRequests.style.display = 'none';
            return;
        }
        pendingRequests.style.display = 'block';
        requestsList.innerHTML = '';
        requests.forEach(user => {
            const div = document.createElement('div');
            div.className = 'request-item';
            const avatarSrc = user.avatarUrl || `https://ui-avatars.com/api/?name=${user.username}&background=random`;
            div.innerHTML = `
                <div style="display:flex; align-items:center; gap:10px">
                    <img src="${avatarSrc}" style="width:30px; height:30px; border-radius:50%">
                    <span>${user.username} (Lvl ${user.level})</span>
                </div>
                <button class="accept-btn" data-id="${user.id}">Accept</button>
            `;
            div.querySelector('.accept-btn').onclick = () => acceptFriend(user.id);
            requestsList.appendChild(div);
        });
    }

    async function acceptFriend(friendId) {
        const response = await fetch('/api/friends/accept', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ friendId })
        });
        if (response.ok) {
            fetchFriends();
            fetchPendingRequests();
            updateProfile();
        }
    }

    async function fetchFriends() {
        const response = await fetch('/api/friends', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const friends = await response.json();
        renderFriends(friends);
    }

    function renderFriends(friends) {
        friendsList.innerHTML = friends.length ? '' : '<p style="text-align:center; color:var(--text-muted); margin-top:1rem">No friends yet. Search above!</p>';
        friends.forEach(friend => {
            const div = document.createElement('div');
            div.className = 'friend-card animate-in';
            const avatarSrc = friend.avatarUrl || `https://ui-avatars.com/api/?name=${friend.username}&background=random`;
            div.innerHTML = `
                <div style="display:flex; align-items:center; gap:15px">
                    <img src="${avatarSrc}" style="width:40px; height:40px; border-radius:50%">
                    <div class="friend-info">
                        <span class="friend-name">${friend.username}</span>
                        <span class="friend-lvl">Level ${friend.level} • ${friend.xp} XP</span>
                    </div>
                </div>
                <small>Click to view tasks</small>
            `;
            div.onclick = () => viewFriendTasks(friend);
            friendsList.appendChild(div);
        });
    }

    function viewFriendTasks(friend) {
        selectedFriendId = friend.id;
        currentTab = 'friend-tasks';
        friendsContainer.style.display = 'none';
        taskList.style.display = 'block';
        fetchTasks(friend.id, friend.username);
    }

    // --- API Calls ---
    async function fetchTasks(friendId = null, friendName = '') {
        let endpoint = '';
        let headers = { 'Authorization': `Bearer ${token}` };

        if (friendId) {
            endpoint = `/api/friends/${friendId}/tasks`;
        } else {
            endpoint = currentTab === 'my' ? '/api/tasks' : '/api/tasks/public';
            if (currentTab === 'public') headers = {};
        }

        const response = await fetch(endpoint, { headers });
        if (response.status === 401 || response.status === 403) {
            logoutBtn.onclick();
            return;
        }
        const tasks = await response.json();
        renderTasks(tasks, friendName);
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
        if (response.ok) {
            fetchTasks();
            updateProfile();
        }
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

    function renderTasks(tasks, friendName = '') {
        taskList.innerHTML = '';
        if (friendName) {
            const header = document.createElement('div');
            header.style.marginBottom = '1rem';
            header.innerHTML = `<button class="tab" id="backToFriends">← Back to Friends</button> <h3 style="display:inline; margin-left:1rem">${friendName}'s Public Tasks</h3>`;
            header.querySelector('#backToFriends').onclick = () => {
                currentTab = 'friends';
                friendsContainer.style.display = 'flex';
                taskList.style.display = 'none';
                fetchFriends();
            };
            taskList.appendChild(header);
        }

        if (tasks.length === 0) {
            taskList.innerHTML += '<p style="text-align:center; color:var(--text-muted); margin-top:2rem;">No tasks found.</p>';
            return;
        }

        tasks.forEach((task, index) => {
            const li = document.createElement('li');
            li.className = `task-item animate-in ${task.completed ? 'completed' : ''}`;
            li.style.animationDelay = `${index * 0.05}s`;
            
            const isOwner = currentTab === 'my';
            const showAuthor = task.isPublic && !isOwner && !friendName;
            const avatarSrc = task.avatarUrl || `https://ui-avatars.com/api/?name=${task.username}&background=random`;

            li.innerHTML = `
                <div class="task-info">
                    <div class="checkbox"></div>
                    <div class="task-meta">
                        <span>${task.text}</span>
                        ${showAuthor ? `
                        <div style="display:flex; align-items:center; gap:5px; margin-top:5px">
                            <img src="${avatarSrc}" style="width:16px; height:16px; border-radius:50%">
                            <small>By: ${task.username || 'Unknown'}</small>
                        </div>` : ''}
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

    friendSearch.oninput = (e) => searchUsers(e.target.value);
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.search-box')) {
            searchResults.style.display = 'none';
        }
    });

    fetchTasks();
    updateProfile();
});
