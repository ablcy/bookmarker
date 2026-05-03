const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

let users = {};
let messages = {};
let friends = {};

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
  
  if (!friends[userId]) {
    friends[userId] = [];
  }
  
  if (!messages[userId]) {
    messages[userId] = {};
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
  
  if (!messages[userId]) {
    messages[userId] = {};
  }
  if (!messages[userId][friend.id]) {
    messages[userId][friend.id] = [];
  }
  
  if (!messages[friend.id]) {
    messages[friend.id] = {};
  }
  if (!messages[friend.id][userId]) {
    messages[friend.id][userId] = [];
  }
  
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

app.post('/api/send-message', (req, res) => {
  const { senderId, receiverId, content } = req.body;
  
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
  
  res.json({ success: true, message });
});

app.post('/api/mark-read', (req, res) => {
  const { userId, friendId } = req.body;
  
  if (messages[userId] && messages[userId][friendId]) {
    messages[userId][friendId].forEach(msg => {
      if (msg.senderId !== userId) {
        msg.read = true;
      }
    });
  }
  
  res.json({ success: true });
});

app.get('/api/users', (req, res) => {
  const userList = Object.values(users).map(u => ({ id: u.id, username: u.username }));
  res.json({ success: true, users: userList });
});

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});