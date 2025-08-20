const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

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

  // Toggle cam
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
    // gửi tin nhắn lại cho cả phòng
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



server.listen(3000, () => {
  console.log('Server chạy tại http://localhost:3000');
})