const fs = require('fs');
const express = require('express');
const socket = require('socket.io');
const jwt = require('jsonwebtoken');
const privateKey = fs.readFileSync('./keys/private.pem');
const publicKey = fs.readFileSync('./keys/public.pem');

jwt.sign({ foo: 'bar' }, privateKey, { algorithm: 'RS256' }, function (err, token) {
    console.log(token);
    jwt.verify(token, publicKey, function (err, decoded) {
        console.log(decoded.foo);
    });
});


const app = express();
const server = app.listen(4000, () => {
    console.log('listening on port 4000');
}); // TODO must convert this to HTTPS or use specific container setup

const io = socket(server);
io.on('connection', ws => {
    console.log('a user connected', ws.id);

    ws.on('chat', data => {
        io.sockets.emit('chat', data); // io.to(`${socketId}`).emit('hey', 'I just met you');
    });

});

// openssl genrsa -out private.pem 2048 # to encrypt -aes-256-cbc
// openssl rsa -in private.pem -outform PEM -pubout -out public.pem
