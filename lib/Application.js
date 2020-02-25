const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const socket = require('socket.io');
const jwt = require('jsonwebtoken');
const socketioJwt = require('socketio-jwt');
const uuidv4 = require('uuid/v4');
const mysql = require('mysql');
const bcrypt = require('bcrypt');

const HelpDesk = require('./HelpDesk');
const User = require('./User');
const Conversation = require('./Conversation');
const Message = require('./Message');

module.exports = class Application {

    constructor(port, privateKey, publicKey) {
        this._privateKey = privateKey;
        this._publicKey = publicKey;
        this._DbConnection = mysql.createConnection({
            host: process.env.ENDPOINT || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.PASSWORD || 'password',
            database: 'helpdesk'
        });
        this._DbConnection.connect();
        this._expressApp = express();
        this._expressApp.use(cors());
        this._expressApp.use(bodyParser.json());
        const expServer = this._expressApp.listen(port, () => {
            console.log(`listening on port ${port}`);
        });
        this._socketio = socket(expServer);
        this._helpDesk = new HelpDesk();
    }

    run() {
        this._initRestEndpoints();
        this._initChatServer();
    }

    _initRestEndpoints() {
        this._expressApp.get('/health', (req, res) => {
            res.end('OK');
        });
        
        this._expressApp.post('/login/hash', (req, res, next) => {
            res.set('Content-Type', 'application/json');
            if (!isValidString(req.body.password)) {
                res.sendStatus(400);
                next(new Error('Bad Request'));
            } else {
                bcrypt.hash(req.body.password, saltRounds, (err, hash) => {
                    if (err) {
                        res.sendStatus(500);
                        res.end(JSON.stringify({
                            message: 'Could not generate the hash: ' + err
                        }));
                    } else {
                        res.sendStatus(200);
                        res.end(JSON.stringify({
                            hash: hash
                        }));
                    }
                });
            }
        });
        
        this._expressApp.post('/login/client', (req, res, next) => {
            res.set('Content-Type', 'application/json');
            try {
                this._loginAsClient(req.body.firstName, req.body.lastName).then(result => {
                    res.sendStatus(result.code);
                    res.end(result.response);
                }).catch(err => {
                    res.sendStatus(err.code);
                    next(err.respons);
                });
            } catch (err) {
                res.sendStatus(400);
                next(err);
            }
        });
        
        this._expressApp.post('/login/help-desk', (req, res, next) => {
            res.set('Content-Type', 'application/json');
            try {
                this._loginAsHelper(req.body.username, req.body.password).then(result => {
                    res.sendStatus(result.code);
                    res.end(result.response);
                }).catch(err => {
                    res.sendStatus(err.code);
                    next(err.respons);
                });
            } catch (err) {
                res.sendStatus(400);
                next(err);
            }
        });
    }

    _initChatServer() {
        // set authorization for socket.io
        this._socketio.sockets.on('connection', socketioJwt.authorize({
            secret: this._publicKey,
            timeout: 1500 // 15 seconds to send the authentication message
        })).on('authenticated', ws => {
            const currentUser = new User(ws.decoded_token);
            this._helpDesk.registerUser(currentUser);
            this._sendOutOnlineUsers();

            ws.on('disconnect', () => {
                if (user.convo !== null)
                    this._endConversation(user.convo);
                this._helpDesk.deRegisterUser(currentUser);
                this._sendOutOnlineUsers();
            });

            ws.on('leaveConversation', () => {
                this._endConversation(currentUser.convo);
                this._sendOutOnlineUsers();
            });

            ws.on('sendMessage', text => {
                const message = new Message(text, currentUser);
                this._sendMessage(message);
            });

            ws.on('queueClient', () => {
                this._helpDesk.queueClient(this.getClient(currentUser.username));
                this._sendOutOnlineUsers();
            });

            ws.on('joinClient', () => {
                const helper = this._helpDesk.getHelper(currentUser.username);
                const client = this._helpDesk.deQueueClient();
                this._makeConversation(helper, client);
                this._sendOutOnlineUsers();
            });

            ws.on('joinHelper', helperUsername => {
                this._helpDesk.getHelper(currentUser.username).makeConversation(this._helpDesk.getHelper(helperUsername));
                this._sendOutOnlineUsers();
            });

            ws.on('transferClient', (clientUsername, helperUsername) => {
                const helperA = this._helpDesk.getHelper(currentUser.username);
                const helperB = this._helpDesk.getHelper(helperUsername);
                const client = this._helpDesk.getClient(clientUsername);
                this._trnasferClient(helperA, client, helperB);
                this._sendOutOnlineUsers();
            });

        });
    }

    _makeConversation(userA, userB) {
        const conversation = new Conversation(userA, userB);
        io.to(`${conversation.userA.socketID}`).emit('partyJoined', conversation.userB);
        io.to(`${conversation.userB.socketID}`).emit('partyJoined', conversation.userA);
    }

    _endConversation(convo) {
        if (convo !== null) {
            this._socketio.to(`${convo.userA.socketID}`).emit('partyLeft', convo.userB);
            this._socketio.to(`${convo.userB.socketID}`).emit('partyLeft', convo.userA);
            convo.end();
        } else
            throw new Error('User has no active conversation.');
    }

    _trnasferClient(helperA, client, helperB) {
        if (helperA.convo !== null && helperA.convo.getOtherParty(helperA).username == client.username) {
            this.endConversation(helperA.convo);
            this.makeConversation(helperB, client);
        } else
            throw new Error('Client can not be transferred.');
    }

    _sendMessage(message) {
        this._DbConnection.query('INSERT INTO messages SET ?', message, (error, results, fields) => {
            if (error) throw error;
            this._socketio.to(`${message.fromID}`).emit('chatReceive', { ...message, isMe: message.from == currentUser.username });
            this._socketio.to(`${message.toID}`).emit('chatReceive', { ...message, isMe: message.to == currentUser.username });
        });
    }

    _sendOutOnlineUsers() {
        for (const helper of this._helpDesk.helperList) {
            this._socketio.to(`${helper.socketID}`).emit('onlineUsers', this._helpDesk.status);
        }
    }

    _loginAsClient(firstName, lastName) {
        if (!this._isValidString(firstName) || !this._isValidString(lastName))
            throw new Error('Bad Request');
        else
            return this._issueJWT(uuidv4(), firstName, lastName, true);
    }

    _loginAsHelper(username, password) {
        if (!this._isValidString(username) || !this._isValidString(password)) {
            throw new Error('Bad Request');
        } else {
            const p = new Promise((resolve, reject) => {
                const query = "select hash, first_name, last_name from helpers where username = ?";
                this._DbConnection.query(query, [req.body.username], (error, results, fields) => {
                    if (error) {
                        reject({
                            code: 500,
                            response: JSON.stringify({
                                message: 'Database Error: ' + error
                            })
                        });
                    } else if (results[0] !== undefined) {
                        bcrypt.compare(password, results[0].hash, (err, result) => {
                            if (result === true)
                                this._issueJWT(username, firstName, lastName, false).then(result => {
                                    resolve(result);
                                }).catch(() => {
                                    reject(result);
                                });
                            else if (result === false)
                                reject({
                                    code: 401,
                                    response: JSON.stringify({
                                        token: null
                                    })
                                });
                            else
                                reject({
                                    code: 500,
                                    response: JSON.stringify({
                                        message: 'Authentication Error: ' + err
                                    })
                                });
                        });
                    } else {
                        reject({
                            code: 401,
                            response: JSON.stringify({
                                token: null
                            })
                        });
                    }
                });
            });
            return p;
        }
    }

    _issueJWT(username, firstName, lastName, isClient) {
        const p = new Promise((resolve, reject) => {
            jwt.sign({
                username: username,
                firstName: firstName,
                lastName: lastName,
                isClient: isClient
            }, privateKey, { expiresIn: 60 * 60, algorithm: 'RS256' }, (err, token) => {
                if (token)
                    resolve({
                        code: 200,
                        response: JSON.stringify({
                            token: token
                        })
                    });
                else
                    reject({
                        code: 500,
                        response: JSON.stringify({
                            message: 'Could not issue the token: ' + err
                        })
                    });
            });
        });
        return p;
    }

    _isValidString(parameter) {
        return parameter !== undefined && parameter !== null && parameter !== '';
    }

}