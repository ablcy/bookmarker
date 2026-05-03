class ChatApp {
    constructor() {
        this.currentUser = null;
        this.currentFriend = null;
        this.messages = {};
        this.friends = [];
        this.socket = null;
        this.baseUrl = window.location.origin.includes('localhost') ? 'http://localhost:3000' : window.location.origin;
        this.init();
    }

    init() {
        this.bindEvents();
        this.loadUserData();
    }

    bindEvents() {
        document.getElementById('login-tab').addEventListener('click', () => this.showLogin());
        document.getElementById('register-tab').addEventListener('click', () => this.showRegister());
        document.getElementById('login-form').addEventListener('submit', (e) => this.handleLogin(e));
        document.getElementById('register-form').addEventListener('submit', (e) => this.handleRegister(e));
        document.getElementById('logout-btn').addEventListener('click', () => this.logout());
        document.getElementById('add-friend-btn').addEventListener('click', () => this.addFriend());
        document.getElementById('send-btn').addEventListener('click', () => this.send());
        document.getElementById('message-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.send();
        });
    }

    loadUserData() {
        const storedUser = localStorage.getItem('currentUser');
        if (storedUser) {
            this.currentUser = JSON.parse(storedUser);
            this.connectSocket();
            this.loadFriends();
            this.loadMessages();
            this.showMainScreen();
        }
    }

    connectSocket() {
        this.socket = io(this.baseUrl);
        
        this.socket.on('connect', () => {
            console.log('Connected to server');
            this.socket.emit('authenticate', this.currentUser.id);
        });
        
        this.socket.on('new_message', (data) => {
            const { senderId, message } = data;
            if (!this.messages[senderId]) {
                this.messages[senderId] = [];
            }
            this.messages[senderId].push(message);
            this.renderFriendsList();
            
            if (this.currentFriend && this.currentFriend.id === senderId) {
                this.renderMessages();
            }
        });
        
        this.socket.on('message_sent', (message) => {
            console.log('Message sent:', message);
        });
        
        this.socket.on('disconnect', () => {
            console.log('Disconnected from server');
        });
    }

    async fetchData(url, options = {}) {
        try {
            const response = await fetch(`${this.baseUrl}${url}`, {
                headers: {
                    'Content-Type': 'application/json',
                    ...options.headers
                },
                ...options
            });
            return await response.json();
        } catch (error) {
            console.error('Fetch error:', error);
            return { success: false, message: '网络错误' };
        }
    }

    showLogin() {
        document.getElementById('login-tab').classList.add('active');
        document.getElementById('register-tab').classList.remove('active');
        document.getElementById('login-form').style.display = 'flex';
        document.getElementById('register-form').style.display = 'none';
        document.getElementById('login-error').textContent = '';
        document.getElementById('register-error').textContent = '';
    }

    showRegister() {
        document.getElementById('register-tab').classList.add('active');
        document.getElementById('login-tab').classList.remove('active');
        document.getElementById('register-form').style.display = 'flex';
        document.getElementById('login-form').style.display = 'none';
        document.getElementById('login-error').textContent = '';
        document.getElementById('register-error').textContent = '';
    }

    async handleLogin(e) {
        e.preventDefault();
        const username = document.getElementById('login-username').value.trim();
        const password = document.getElementById('login-password').value;

        const result = await this.fetchData('/api/login', {
            method: 'POST',
            body: JSON.stringify({ username, password })
        });

        if (result.success) {
            this.currentUser = result.user;
            localStorage.setItem('currentUser', JSON.stringify(result.user));
            this.connectSocket();
            await this.loadFriends();
            await this.loadMessages();
            this.showMainScreen();
        } else {
            document.getElementById('login-error').textContent = result.message || '登录失败';
        }
    }

    async handleRegister(e) {
        e.preventDefault();
        const username = document.getElementById('register-username').value.trim();
        const password = document.getElementById('register-password').value;
        const confirmPassword = document.getElementById('register-password-confirm').value;

        if (password !== confirmPassword) {
            document.getElementById('register-error').textContent = '两次输入的密码不一致';
            return;
        }

        if (username.length < 3) {
            document.getElementById('register-error').textContent = '用户名至少需要3个字符';
            return;
        }

        const result = await this.fetchData('/api/register', {
            method: 'POST',
            body: JSON.stringify({ username, password })
        });

        if (result.success) {
            this.currentUser = result.user;
            localStorage.setItem('currentUser', JSON.stringify(result.user));
            this.connectSocket();
            this.friends = [];
            this.messages = {};
            this.showMainScreen();
        } else {
            document.getElementById('register-error').textContent = result.message || '注册失败';
        }
    }

    showMainScreen() {
        document.getElementById('auth-screen').style.display = 'none';
        document.getElementById('main-screen').style.display = 'flex';
        this.updateUserInfo();
        this.renderFriendsList();
    }

    updateUserInfo() {
        const avatar = document.querySelector('.user-info .avatar span');
        const username = document.querySelector('.user-details .username');
        if (this.currentUser) {
            avatar.textContent = this.currentUser.username.charAt(0).toUpperCase();
            username.textContent = this.currentUser.username;
        }
    }

    logout() {
        localStorage.removeItem('currentUser');
        if (this.socket) {
            this.socket.disconnect();
        }
        this.currentUser = null;
        this.currentFriend = null;
        this.friends = [];
        this.messages = {};
        document.getElementById('main-screen').style.display = 'none';
        document.getElementById('auth-screen').style.display = 'flex';
        document.getElementById('login-username').value = '';
        document.getElementById('login-password').value = '';
    }

    async loadFriends() {
        if (!this.currentUser) return;
        
        const result = await this.fetchData(`/api/friends/${this.currentUser.id}`);
        
        if (result.success) {
            this.friends = result.friends;
        } else {
            this.friends = [];
        }
    }

    async loadMessages() {
        if (!this.currentUser) return;
        
        for (const friend of this.friends) {
            const result = await this.fetchData(`/api/messages/${this.currentUser.id}/${friend.id}`);
            if (result.success) {
                this.messages[friend.id] = result.messages;
            } else {
                this.messages[friend.id] = [];
            }
        }
    }

    async addFriend() {
        const friendUsername = document.getElementById('add-friend-input').value.trim();
        const errorElement = document.getElementById('add-friend-error');

        if (!friendUsername) {
            errorElement.textContent = '请输入用户名';
            return;
        }

        if (friendUsername === this.currentUser.username) {
            errorElement.textContent = '不能添加自己为好友';
            return;
        }

        const result = await this.fetchData('/api/add-friend', {
            method: 'POST',
            body: JSON.stringify({ userId: this.currentUser.id, friendUsername })
        });

        if (result.success) {
            this.friends.push(result.friend);
            this.messages[result.friend.id] = [];
            document.getElementById('add-friend-input').value = '';
            errorElement.textContent = '';
            this.renderFriendsList();
        } else {
            errorElement.textContent = result.message || '添加失败';
        }
    }

    renderFriendsList() {
        const friendsList = document.getElementById('friends-list');
        
        if (this.friends.length === 0) {
            friendsList.innerHTML = '<div class="empty-state">暂无好友</div>';
            return;
        }

        friendsList.innerHTML = this.friends.map(friend => {
            const unreadCount = this.getUnreadCount(friend.id);
            return `
                <div class="friend-item" data-friend-id="${friend.id}">
                    <div class="avatar small">
                        <span>${friend.username.charAt(0).toUpperCase()}</span>
                    </div>
                    <span class="friend-name">${friend.username}</span>
                    ${unreadCount > 0 ? `<span class="unread">${unreadCount}</span>` : ''}
                </div>
            `;
        }).join('');

        document.querySelectorAll('.friend-item').forEach(item => {
            item.addEventListener('click', () => this.selectFriend(item.dataset.friendId));
        });
    }

    getUnreadCount(friendId) {
        const friendMessages = this.messages[friendId] || [];
        return friendMessages.filter(m => !m.read).length;
    }

    selectFriend(friendId) {
        const friend = this.friends.find(f => f.id === friendId);
        if (!friend) return;

        this.currentFriend = friend;
        
        document.querySelectorAll('.friend-item').forEach(item => {
            item.classList.remove('active');
            if (item.dataset.friendId === friendId) {
                item.classList.add('active');
            }
        });

        this.markMessagesAsRead(friendId);
        this.renderChatHeader();
        this.renderMessages();
        this.showMessageInput();
    }

    markMessagesAsRead(friendId) {
        const friendMessages = this.messages[friendId] || [];
        friendMessages.forEach(m => m.read = true);
        
        if (this.socket) {
            this.socket.emit('mark_read', { userId: this.currentUser.id, friendId });
        }
        
        this.renderFriendsList();
    }

    renderChatHeader() {
        const header = document.getElementById('chat-header');
        if (this.currentFriend) {
            header.innerHTML = `
                <div class="friend-info">
                    <div class="avatar small">
                        <span>${this.currentFriend.username.charAt(0).toUpperCase()}</span>
                    </div>
                    <span class="friend-name">${this.currentFriend.username}</span>
                </div>
            `;
        }
    }

    renderMessages() {
        const container = document.getElementById('messages-container');
        
        if (!this.currentFriend) {
            container.innerHTML = '<div class="empty-chat"><p>选择一个好友开始聊天</p></div>';
            return;
        }

        const friendMessages = this.messages[this.currentFriend.id] || [];
        
        if (friendMessages.length === 0) {
            container.innerHTML = '<div class="empty-chat"><p>还没有消息，开始聊天吧！</p></div>';
            return;
        }

        container.innerHTML = friendMessages.map(msg => `
            <div class="message ${msg.senderId === this.currentUser.id ? 'sent' : 'received'}">
                <p>${msg.content}</p>
                <span class="message-time">${msg.time}</span>
            </div>
        `).join('');

        container.scrollTop = container.scrollHeight;
    }

    showMessageInput() {
        document.getElementById('message-input-area').style.display = 'flex';
        document.getElementById('message-input').focus();
    }

    send() {
        const input = document.getElementById('message-input');
        const content = input.value.trim();

        if (!content || !this.currentFriend) return;

        if (this.socket) {
            this.socket.emit('send_message', {
                senderId: this.currentUser.id,
                receiverId: this.currentFriend.id,
                content
            });

            const message = {
                id: Date.now().toString(),
                senderId: this.currentUser.id,
                content,
                time: this.formatTime(new Date()),
                read: false
            };

            if (!this.messages[this.currentFriend.id]) {
                this.messages[this.currentFriend.id] = [];
            }

            this.messages[this.currentFriend.id].push(message);
            input.value = '';
            this.renderMessages();
        }
    }

    formatTime(date) {
        const hours = date.getHours().toString().padStart(2, '0');
        const minutes = date.getMinutes().toString().padStart(2, '0');
        return `${hours}:${minutes}`;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new ChatApp();
});