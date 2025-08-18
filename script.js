const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

io.on('connection', (socket) => {
  socket.on('join', (room) => {
    socket.join(room);
    socket.to(room).emit('new-peer', socket.id);

    socket.on('signal', (data) => {
      io.to(data.to).emit('signal', { from: socket.id, data: data.signal });
    });

    socket.on('disconnect', () => {
      socket.to(room).emit('peer-disconnected', socket.id);
    });
  });
});

server.listen(3000, () => console.log('Server chạy tại http://localhost:3000'));
