module.exports = class HelpDesk {

    constructor() {
        this._clientQueue = [];
        this._clientList = [];
        this._helperList = [];
    }

    get helperList() {
        return this._helperList;
    }

    get _helperUsernames() {
        const list = [];
        for (const helper of this._helperList) {
            list.push(helper.username);
        }
        return list;
    }

    get status() {
        return {
            helpers: this._helperUsernames,
            numberOfClientsOnline: this._clientList.length,
            numberOfClientsInQueue: this._clientQueue.length
        };
    }

    getHelper(username) {
        for (const helper of this._helperList)
            if (helper.username == username && !helper.isClient)
                return helper;
        throw new Error('Helper not found.');
    }

    getClient(username) {
        for (const client of this._clientList)
            if (client.username == username && client.isClient)
                return client;
        throw new Error('Client not found.');
    }

    registerUser(user) {
        if (user.isClient) {
            this._clientList.push(user);
        } else
            this._helperList.push(user);
    }

    queueClient(client) {
        for (const c of this._clientQueue)
            if (c.username == client.username)
                throw new Error('Client is already in the queue.');
        this._clientQueue.push(client);
    }

    deQueueClient() {
        if (this._clientQueue.length > 0) {
            return this.getClient(this._clientQueue.pop().username);
        } else
            throw new Error('No client is in queue.');
    }

    deRegisterUser(user) {
        if (user.isClient) {
            this._clientList = this._clientList.filter(c => c.username !== user.username);
            this._clientQueue = this._clientQueue.filter(c => c.username !== user.username);
        } else
            this._helperList = this._helperList.filter(h => h.username !== user.username);
    }

}