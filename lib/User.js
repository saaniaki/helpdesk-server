module.exports = class User {

    constructor(jwtPayload) {
        this.username = jwtPayload.username;
        this.socketID = jwtPayload.socketID;
        this.firstName = jwtPayload.firstName;
        this.lastName = jwtPayload.lastName;
        this.isClient = jwtPayload.isClient;
        this.conversation = null;
    }

}