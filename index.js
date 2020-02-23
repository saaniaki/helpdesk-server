const fs = require('fs');
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const socket = require('socket.io');
const jwt = require('jsonwebtoken');
const socketioJwt = require('socketio-jwt');
const uuidv4 = require('uuid/v4');
const privateKey = fs.readFileSync('./keys/private.pem');
const publicKey = fs.readFileSync('./keys/public.pem');
const app = express();
app.use(cors());
app.use(bodyParser.json());
const server = app.listen(4000, () => {
    console.log('listening on port 4000');
}); // TODO must convert this to HTTPS or use specific container setup


app.post('/login/client', (req, res, next) => {
    res.set('Content-Type', 'application/json');
    if (!isValidString(req.body.firstName) || !isValidString(req.body.lastName)) {
        res.sendStatus(400);
        next(new Error('Bad Request'));
    } else
        issueJWT(
            uuidv4(),
            req.body.firstName,
            req.body.lastName,
            true,
            (err, token) => {
                res.end(JSON.stringify({
                    token: token
                }));
            }
        );
});

// TODO authenticate user again databse
app.post('/login/help-desk', (req, res, next) => {
    res.set('Content-Type', 'application/json');
    if (!isValidString(req.body.username) || !isValidString(req.body.password)) {
        res.sendStatus(400);
        next(new Error('Bad Request'));
    } else
        issueJWT(
            req.body.username,
            req.body.firstName,
            req.body.lastName,
            false,
            (err, token) => {
                res.end(JSON.stringify({
                    token: token
                }));
            }
        );
});

function isValidString(parameter) {
    return parameter !== undefined && parameter !== null && parameter !== '';
}

function issueJWT(username, firstName, lastName, isClient, callback) {
    jwt.sign({
        username: username,
        firstName: firstName,
        lastName: lastName,
        isClient: isClient
    }, privateKey, { expiresIn: 60 * 60, algorithm: 'RS256' }, callback);
}

// openssl genrsa -out private.pem 2048 # to encrypt -aes-256-cbc
// openssl rsa -in private.pem -outform PEM -pubout -out public.pem

/* Web Socket */

let clientQueue = [];
let helperQueue = [];
let conversationList = [];
const io = socket(server);


// set authorization for socket.io
io.sockets.on('connection', socketioJwt.authorize({
    secret: publicKey,
    timeout: 500 // 15 seconds to send the authentication message
})).on('authenticated', socket => {
    registerUser(socket);
    
    const currentUserName = socket.decoded_token.username;

    socket.on('chatSend', msg => {
        let currentConvo = findConversation(currentUserName);

        if (currentConvo !== undefined) {
            const data = {
                timeStamp: new Date(),
                message: msg
            };

            io.to(`${currentConvo.client.socketID}`).emit('chatReceive', { ...data, isMe: currentConvo.client.username == currentUserName });
            io.to(`${currentConvo.helper.socketID}`).emit('chatReceive', { ...data, isMe: currentConvo.client.username != currentUserName });
        }
    });

    socket.on('disconnect', () => {
        let currentConvo = findConversation(currentUserName);
        if (currentConvo !== undefined) {
            if (currentConvo.client.username != currentUserName) io.to(`${currentConvo.client.socketID}`).emit('partyLeft', null);
            else io.to(`${currentConvo.helper.socketID}`).emit('partyLeft', null);
            conversationList = conversationList.filter( c => !c.containsUsername(currentUserName));
        } else {
            if (socket.decoded_token.isClient) clientQueue = clientQueue.filter( c => c.username !== currentUserName);
            else helperQueue = clientQueue.filter( c => c.username !== currentUserName);
        }
    });

    socket.on('joinQueue', () => {
        let currentConvo = findConversation(currentUserName);
        if (currentConvo === undefined) registerUser(socket);
    });
});

function registerUser(socket) {
    const currentUserName = socket.decoded_token.username;
    if (socket.decoded_token.isClient) {
        // console.log(`registering ${currentUserName} : ${socket.id} as client`);
        let client = new Client(currentUserName, socket.id);
        if (helperQueue.length != 0) {
            let helper = helperQueue.shift();
            conversationList.push(new Conversation(client, helper));
            io.to(`${helper.socketID}`).emit('partyJoined', client); // notify helper about client
            io.to(`${client.socketID}`).emit('partyJoined', helper); // notify client about helper
        } else
            clientQueue.push(client);
    } else {
        // console.log(`registering ${currentUserName} : ${socket.id} as helper`);
        let helper = new Helper(currentUserName, socket.id);
        if (clientQueue.length != 0) {
            let client = clientQueue.shift();
            conversationList.push(new Conversation(client, helper));
            io.to(`${helper.socketID}`).emit('partyJoined', client); // notify helper about client
            io.to(`${client.socketID}`).emit('partyJoined', helper); // notify client about helper
        } else
            helperQueue.push(helper);
    }
}

function findConversation(currentUserName) {
    for (const convo of conversationList) {
        if (convo.containsUsername(currentUserName)) {
            return convo;
        }
    }
}

/* Models */

class Client {

    constructor(username, socketID) {
        this.username = username;
        this.socketID = socketID;
    }

}

class Helper {

    constructor(username, socketID) {
        this.username = username;
        this.socketID = socketID;
    }

}

class Conversation {

    constructor(client, helper) {
        this.client = client;
        this.helper = helper;
    }

    containsUsername(username) {
        return this.client.username == username || this.helper.username == username;
    }
}