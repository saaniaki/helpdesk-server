module.exports = class Conversation {

    constructor(userA, userB) {
        this.userA = userA;
        this.userB = userB;
        if (this.userA.convo != null || this.helperB.convo != null)
            throw new Error('Helper is in another conversation.');
        this.userA.convo = this;
        this.userB.convo = this;
    }

    get hasTwoHelpers() {
        return !this.userA.isClient && !this.userB.isClient;
    }

    get helper_s() {
        const helper_s = [];
        if (!this.userA.isClient) helper_s.push(this.userA);
        if (!this.userB.isClient) helper_s.push(this.userB);
        return helper_s;
    }

    get client() {
        if (this.userA.isClient) return this.userA;
        else if (this.userB.isClient) return this.userB;
    }

    getOtherParty(user) {
        if (this.userA.username == user.username) return this.userA;
        else return this.userB;
    }

    end() {
        this.userA.convo = null;
        this.userA = null;
        this.userB.convo = null;
        this.userB = null;
    }

}