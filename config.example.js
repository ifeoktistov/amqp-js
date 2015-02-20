module.exports = {
    port : 88,
    manage: {
        userName: '',
        password: ''
    },
    amqp : {
        host: "127.0.0.1",
        login: 'guest',
        password: 'guest',
        queue: 'messages'
    },
    'longPolling' : {
        timeout : 60000 //ms
    }
};