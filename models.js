export default class Client {

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