// server.js
const express = require("express");
const http = require("http");
const socketIO = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = socketIO(server);


app.use(express.static("public"));


let rooms = {};

io.on("connection", (socket) => {
    console.log("Client connected:", socket.id);

    
    socket.on("join-room", (roomId) => {
        socket.join(roomId);
        console.log(` ${socket.id} joined room: ${roomId}`);

        
        socket.to(roomId).emit("user-joined", socket.id);

        
        if (!rooms[roomId]) {
            rooms[roomId] = [];
        }
        rooms[roomId].push(socket.id);

        
        socket.emit("existing-users", rooms[roomId].filter(id => id !== socket.id));
    });

    
    socket.on("signal", (data) => {
        io.to(data.target).emit("signal", {
            sender: socket.id,
            signal: data.signal
        });
    });

    
    socket.on("disconnect", () => {
        console.log("Client disconnected:", socket.id);
        for (let roomId in rooms) {
            rooms[roomId] = rooms[roomId].filter(id => id !== socket.id);
            socket.to(roomId).emit("user-left", socket.id);
        }
    });
});


server.listen(3000, "0.0.0.0", () => {
    console.log("🚀 Server chạy tại: http://<IP_LAN_của_bạn>:3000");
});
