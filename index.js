const express = require('express');
const socket = require('socket.io');

const app = express();
const server = app.listen(4000, () => {
    console.log('listening on port 4000');
}); // TODO must convert this to HTTPS or use specific container setup

const io = socket(server);
io.on('connection', ws => {
    console.log('a user connected', ws.id);

    ws.on('chat', data => {
        io.sockets.emit('chat', data);
    });

});
