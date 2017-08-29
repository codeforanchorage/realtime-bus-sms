module.exports = {
    multiple: {
    object: "page",
    entry: [{
        id: 1,
        time: Date.now(),
        messaging: [{
            sender: {id: 'user1'},
            recipient: {id: "123"},
            timestamp: Date.now(),
            message: { text: "1067" }
        },
        {
            sender: {id: 'user2'},
            recipient: {id: "456"},
            timestamp: Date.now(),
            message: { text: "1071" }
        }]
    },
    {
        id: 2,
        time: Date.now(),
        messaging: [{
            sender: {id: 'user3'},
            recipient: {id: "789"},
            timestamp: Date.now(),
            message: { text: "1072" }
        },
        {
            sender: {id: 'user4'},
            recipient: {id: "abc"},
            timestamp: Date.now(),
            message: { text: "2051" }
        }]
    }]
    },
    single_about() { // this is a function to allow changing the object without side effects.
        return {
            object: "page",
            entry: [{
                id: 1,
                time: Date.now(),
                messaging: [{
                    sender: {id: 'user5'},
                    recipient: {id: "some_recipient"},
                    timestamp: Date.now(),
                    message: { text: "about" }
                }]
            }]
        }
    }
}