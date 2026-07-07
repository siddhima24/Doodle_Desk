// server/index.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());
const server = http.createServer(app);
//const io = new Server(server, { cors: { origin: "http://localhost:3000", methods: ["GET", "POST"] } });

const io = new Server(server, { 
  cors: { 
    origin: ["http://localhost:3000", process.env.FRONTEND_URL], 
    methods: ["GET", "POST"] 
  } 
});

const MASTER_ADMIN_PASSWORD = "crimeinvestigationdepartment";

// 🧠 Advanced Server Memory
const roomsData = {};
const registeredUsers = {}; // { username: "their_password" }
const pendingUsers = {};    // { username: "their_desired_password" }
const usersInRooms = {};    // { roomName: ['user1', 'user2'] }

io.on('connection', (socket) => {
  
  // --- 1. USER REGISTRATION & LOGIN ---
  socket.on('request-registration', ({ username, password }, callback) => {
    if (registeredUsers[username]) return callback({ success: false, message: "Name taken!" });
    
    // Save their requested password in the pending list
    if (!pendingUsers[username]) pendingUsers[username] = password;
    
    callback({ success: true, message: "Sent to manager. Waiting for approval..." });
  });

  socket.on('login', ({ username, password }, callback) => {
    if (!registeredUsers[username]) return callback({ success: false, message: "User not found or not approved yet." });
    if (registeredUsers[username] !== password) return callback({ success: false, message: "Wrong password." });
    callback({ success: true });
  });

  // --- 2. ADMIN ACTIONS ---
  socket.on('admin-login', (password, callback) => {
    if (password === MASTER_ADMIN_PASSWORD) {
      callback({ success: true, pending: Object.keys(pendingUsers) });
    } else {
      callback({ success: false, message: "Wrong admin password." });
    }
  });

  socket.on('admin-approve', (username) => {
    if (pendingUsers[username]) {
      registeredUsers[username] = pendingUsers[username];
      delete pendingUsers[username];
    }
  });

  // --- 3. ROOM LOGIC ---
  // --- 3. ROOM LOGIC ---
  socket.on('join-room', ({ roomName, password, username }, callback) => {
    if (!roomsData[roomName]) {
       // THE CHANGE: Added drawings: []
       roomsData[roomName] = { password, text: "", drawings: [] };
       usersInRooms[roomName] = [];
    } else if (roomsData[roomName].password !== password) {
       return callback({ success: false, message: "Wrong room password." });
    }

    socket.join(roomName);
    if (!usersInRooms[roomName].includes(username)) usersInRooms[roomName].push(username);
    
    io.to(roomName).emit('update-users', usersInRooms[roomName]);
    
    // THE CHANGE: Added drawings to the success callback
    callback({ 
      success: true, 
      text: roomsData[roomName].text, 
      users: usersInRooms[roomName],
      drawings: roomsData[roomName].drawings 
    });
  });

  // --- 4. TYPING SYNC ---
  socket.on('send-changes', ({ roomName, newText }) => {
    if (roomsData[roomName]) {
      roomsData[roomName].text = newText;
      socket.to(roomName).emit('receive-changes', newText);
    }
  });
  // --- 5. DOODLE SYNC ---
  socket.on('draw-stroke', ({ roomName, stroke }) => {
    if (roomsData[roomName]) {
      roomsData[roomName].drawings.push(stroke);
      socket.to(roomName).emit('receive-stroke', stroke);
    }
  });
  // --- 6. UNDO SYNC ---
  // We now accept the exact strokeId from the frontend
  socket.on('undo-stroke', ({ roomName, strokeId }) => {
    if (roomsData[roomName]) {
      // Filter out only the exact stroke ID the user asked to delete
      roomsData[roomName].drawings = roomsData[roomName].drawings.filter(s => s.strokeId !== strokeId);
      
      // Tell everyone else in the room to delete that exact stroke too
      socket.to(roomName).emit('receive-undo', strokeId);
    }
  });

  // --- 7. LIVE CURSORS ---
  socket.on('mouse-move', ({ roomName, username, x, y }) => {
    // Broadcast this user's mouse coordinates to everyone else in the room
    socket.to(roomName).emit('receive-mouse-move', { username, x, y });
  });

  // --- 8. TYPING INDICATORS ---
  socket.on('typing-status', ({ roomName, username, isTyping }) => {
    // Broadcast whether this user is currently typing
    socket.to(roomName).emit('receive-typing-status', { username, isTyping });
  });
});



//server.listen(3001, () => console.log(`Server running on port 3001`));
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));