const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

io.on('connection', (socket) => {
  socket.on('join', ({room, name}) => {
   
    socket.data.room = room;
    socket.data.name = name;
     socket.join(room);
    socket.to(room).emit('new-peer', socket.id);
  });
  socket.on('signal', ({ to, signal }) => {
    io.to(to).emit('signal', { from: socket.id, data: signal });
  });

    socket.on('leave', () => {
    if (socket.data.room) {
      socket.to(socket.data.room).emit('peer-disconnected', socket.id);
      socket.leave(socket.data.room);
      socket.data.room = null;
    }
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
