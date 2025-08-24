const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const os = require('os');
const path = require('path');

// Hàm lấy IP LAN
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}

const localIP = getLocalIP();
const PORT = process.env.PORT || 3000;

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

// Add config endpoint
app.get('/config', (req, res) => {
  res.json({ ip: localIP, port: PORT });
});

// Serve main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Socket.IO
io.on('connection', (socket) => {
  socket.on('join', ({ room, name }) => {
    socket.data.room = room;
    socket.data.name = name;
    socket.join(room);
    socket.to(room).emit('new-peer', socket.id);

    const usersInRoom = Array.from(io.sockets.adapter.rooms.get(room) || []).map(id => {
      const s = io.sockets.sockets.get(id);
      return { id, name: s?.data?.name || 'Anonymous', mic: s?.data?.mic ?? true, cam: s?.data?.cam ?? true };
    });

    socket.emit('room-users', usersInRoom);
    socket.to(room).emit('user-joined', { id: socket.id, name, mic: true, cam: true });

    console.log(`${name} joined room ${room}`);
  });

  socket.on('signal', ({ to, signal }) => {
    io.to(to).emit('signal', { from: socket.id, data: signal });
  });

  socket.on('toggle-mic', (status) => {
    socket.data.mic = status;
    if (socket.data.room) io.to(socket.data.room).emit('update-user', { id: socket.id, mic: status });
  });

  socket.on('toggle-cam', (status) => {
    socket.data.cam = status;
    if (socket.data.room) io.to(socket.data.room).emit('update-user', { id: socket.id, cam: status });
  });

  socket.on('leave', () => {
    if (socket.data.room) {
      socket.to(socket.data.room).emit('peer-disconnected', socket.id);
      socket.leave(socket.data.room);
      socket.data.room = null;
    }
  });

  socket.on('chatMessage', (data) => {
    io.to(socket.data.room).emit('chatMessage', {
      name: socket.data.name,
      message: data.message
    });
  });

  socket.on('disconnect', () => {
    if (socket.data.room) {
      socket.to(socket.data.room).emit('peer-disconnected', socket.id);
    }
  });
});

// Chạy server trên IP LAN
server.listen(PORT, () => {
  console.log(`Server chạy tại LAN: http://${localIP}:${PORT}`);
  console.log(`Server chạy tại local: http://localhost:${PORT}`);
});