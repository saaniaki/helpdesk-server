const fs = require('fs');
const Application = require('./lib/Application');
const privateKey = fs.readFileSync('./keys/private.pem'); // openssl genrsa -out private.pem 2048 # to encrypt -aes-256-cbc
const publicKey = fs.readFileSync('./keys/public.pem'); // openssl rsa -in private.pem -outform PEM -pubout -out public.pem
const port = 8081;
const app = new Application(port, privateKey, publicKey);
app.run();