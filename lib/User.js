module.exports = class User {

    constructor(jwtPayload, socketID) {
        this.username = jwtPayload.username;
        this.socketID = socketID;
        this.firstName = jwtPayload.firstName;
        this.lastName = jwtPayload.lastName;
        this.isClient = jwtPayload.isClient;
        this.convo = null;
    }

    get data() {
        const {convo, ...data} = this;
        return {...data, isInConvo: convo !== null};
    }

}