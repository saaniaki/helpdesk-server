module.exports = class Message {

    constructor(text, fromUser) {
        this.timestamp = new Date();
        this.text = text;
        this.from = fromUser;
        if (fromUser.convo != null)
            this.to = fromUser.convo.getOtherParty();
        else
            throw new Error('Can not compose the message since the user is not in a conversation.');
    }

}