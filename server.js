const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

const DATA_DIR = './data';
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const MESSAGES_FILE = path.join(DATA_DIR, 'messages.json');
const FRIENDS_FILE = path.join(DATA_DIR, 'friends.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const loadData = (filePath, defaultValue = []) => {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
  } catch (err) {
    console.error(`Error loading ${filePath}:`, err);
  }
  return defaultValue;
};

const saveData = (filePath, data) => {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error(`Error saving ${filePath}:`, err);
  }
};

let users = loadData(USERS_FILE, {});
let messages = loadData(MESSAGES_FILE, {});
let friends = loadData(FRIENDS_FILE, {});

const generateId = () => uuidv4();

app.post('/api/register', (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ success: false, message: '用户名和密码不能为空' });
  }
  
  if (username.length < 3) {
    return res.status(400).json({ success: false, message: '用户名至少需要3个字符' });
  }
  
  if (users[username]) {
    return res.status(400).json({ success: false, message: '用户名已被使用' });
  }
  
  const userId = generateId();
  users[username] = {
    id: userId,
    username,
    password,
    createdAt: new Date().toISOString()
  };
  
  saveData(USERS_FILE, users);
  
  if (!friends[userId]) {
    friends[userId] = [];
    saveData(FRIENDS_FILE, friends);
  }
  
  if (!messages[userId]) {
    messages[userId] = {};
    saveData(MESSAGES_FILE, messages);
  }
  
  res.json({ success: true, user: { id: userId, username } });
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  
  const user = users[username];
  
  if (!user || user.password !== password) {
    return res.status(400).json({ success: false, message: '用户名或密码错误' });
  }
  
  res.json({ success: true, user: { id: user.id, username: user.username } });
});

app.post('/api/add-friend', (req, res) => {
  const { userId, friendUsername } = req.body;
  
  const friend = users[friendUsername];
  
  if (!friend) {
    return res.status(400).json({ success: false, message: '用户不存在' });
  }
  
  if (userId === friend.id) {
    return res.status(400).json({ success: false, message: '不能添加自己为好友' });
  }
  
  if (!friends[userId]) {
    friends[userId] = [];
  }
  
  if (friends[userId].includes(friend.id)) {
    return res.status(400).json({ success: false, message: '已经是好友' });
  }
  
  friends[userId].push(friend.id);
  
  if (!friends[friend.id]) {
    friends[friend.id] = [];
  }
  
  if (!friends[friend.id].includes(userId)) {
    friends[friend.id].push(userId);
  }
  
  saveData(FRIENDS_FILE, friends);
  
  if (!messages[userId][friend.id]) {
    messages[userId][friend.id] = [];
  }
  
  if (!messages[friend.id][userId]) {
    messages[friend.id][userId] = [];
  }
  
  saveData(MESSAGES_FILE, messages);
  
  res.json({ success: true, friend: { id: friend.id, username: friend.username } });
});

app.get('/api/friends/:userId', (req, res) => {
  const { userId } = req.params;
  
  const userFriends = friends[userId] || [];
  const friendList = userFriends.map(friendId => {
    for (const [username, user] of Object.entries(users)) {
      if (user.id === friendId) {
        return { id: user.id, username: user.username };
      }
    }
    return null;
  }).filter(Boolean);
  
  res.json({ success: true, friends: friendList });
});

app.get('/api/messages/:userId/:friendId', (req, res) => {
  const { userId, friendId } = req.params;
  
  const userMessages = messages[userId] || {};
  const friendMessages = userMessages[friendId] || [];
  
  res.json({ success: true, messages: friendMessages });
});

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  
  socket.on('authenticate', (userId) => {
    socket.userId = userId;
    socket.join(userId);
    console.log(`User ${userId} joined room`);
  });
  
  socket.on('send_message', (data) => {
    const { senderId, receiverId, content } = data;
    
    const message = {
      id: generateId(),
      senderId,
      content,
      time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
      timestamp: Date.now(),
      read: false
    };
    
    if (!messages[senderId]) {
      messages[senderId] = {};
    }
    if (!messages[senderId][receiverId]) {
      messages[senderId][receiverId] = [];
    }
    messages[senderId][receiverId].push(message);
    
    if (!messages[receiverId]) {
      messages[receiverId] = {};
    }
    if (!messages[receiverId][senderId]) {
      messages[receiverId][senderId] = [];
    }
    messages[receiverId][senderId].push(message);
    
    saveData(MESSAGES_FILE, messages);
    
    io.to(receiverId).emit('new_message', {
      senderId,
      message
    });
    
    socket.emit('message_sent', message);
  });
  
  socket.on('mark_read', (data) => {
    const { userId, friendId } = data;
    
    if (messages[userId] && messages[userId][friendId]) {
      messages[userId][friendId].forEach(msg => {
        if (msg.senderId !== userId) {
          msg.read = true;
        }
      });
      saveData(MESSAGES_FILE, messages);
    }
  });
  
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});