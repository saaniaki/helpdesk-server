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
const mysql = require('mysql');
const bcrypt = require('bcrypt');
const saltRounds = 10;
app.use(cors());
app.use(bodyParser.json());
const server = app.listen(8081, () => {
    console.log('listening on port 8081');
}); // TODO must convert this to HTTPS or use specific container setup

const connection = mysql.createConnection({
    host: process.env.ENDPOINT || 'localhost',
    user: process.env.DB_USER || 'saaniakihes',
    password: process.env.PASSWORD || 'password',
    database: 'helpdesk'
});
connection.connect();

// app.post('/login/hash', (req, res, next) => {
//     res.set('Content-Type', 'application/json');
//     if (!isValidString(req.body.password)) {
//         res.sendStatus(400);
//         next(new Error('Bad Request'));
//     } else {
//         bcrypt.hash(req.body.password, saltRounds, function (err, hash) {
//             res.end(JSON.stringify({
//                 hash: hash
//             }));
//         });
//     }
// });

app.get('/health', (req, res) => {
    res.end('OK');
});

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
    } else {
        const query = "select hash, `first-name`, `last-name` from helpers where username = ?";
        connection.query(query, [req.body.username], (error, results, fields) => {
            if (error) {
                res.sendStatus(500);
                next(new Error('Database Error.'));
            } else if (results[0] !== undefined) {
                bcrypt.compare(req.body.password, results[0].hash, (err, result) => {
                    if (result === true) {
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
                    } else {
                        res.sendStatus(401);
                        res.end({
                            token: null
                        });
                    }
                });
            } else {
                res.sendStatus(401);
                res.end({
                    token: null
                });
            }
        });
    }
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
                timestamp: new Date(),
                message: msg
            };

            var post = { from: currentConvo.client.username, to: currentConvo.helper.username, ...data };
            var query = connection.query('INSERT INTO messages SET ?', post, function (error, results, fields) {
                if (error) throw error;
                io.to(`${currentConvo.client.socketID}`).emit('chatReceive', { ...data, isMe: currentConvo.client.username == currentUserName });
                io.to(`${currentConvo.helper.socketID}`).emit('chatReceive', { ...data, isMe: currentConvo.client.username != currentUserName });
            });
        }
    });

    socket.on('disconnect', () => {
        let currentConvo = findConversation(currentUserName);
        if (currentConvo !== undefined) {
            if (currentConvo.client.username != currentUserName) io.to(`${currentConvo.client.socketID}`).emit('partyLeft', null);
            else io.to(`${currentConvo.helper.socketID}`).emit('partyLeft', null);
            conversationList = conversationList.filter(c => !c.containsUsername(currentUserName));
        } else {
            if (socket.decoded_token.isClient) clientQueue = clientQueue.filter(c => c.username !== currentUserName);
            else helperQueue = clientQueue.filter(c => c.username !== currentUserName);
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
        let client = new Client(currentUserName, socket.id, socket.decoded_token.firstName, socket.decoded_token.lastName, socket.decoded_token.isClient);
        if (helperQueue.length != 0) {
            let helper = helperQueue.shift();
            conversationList.push(new Conversation(client, helper));
            io.to(`${helper.socketID}`).emit('partyJoined', client); // notify helper about client
            io.to(`${client.socketID}`).emit('partyJoined', helper); // notify client about helper
        } else
            clientQueue.push(client);
    } else {
        // console.log(`registering ${currentUserName} : ${socket.id} as helper`);
        let helper = new Helper(currentUserName, socket.id, socket.decoded_token.firstName, socket.decoded_token.lastName, socket.decoded_token.isClient);
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

class User {
    constructor(username, socketID, firstName, lastName, isClient) {
        this.username = username;
        this.socketID = socketID;
        this.firstName = firstName;
        this.lastName = lastName;
        this.isClient = isClient;
    }
}

class Client extends User {
    constructor(username, socketID, firstName, lastName, isClient) {
        super(username, socketID, firstName, lastName, isClient);
    }
}

class Helper extends User {
    constructor(username, socketID, firstName, lastName, isClient) {
        super(username, socketID, firstName, lastName, isClient);
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