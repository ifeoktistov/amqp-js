module.exports = {
    managePort : 4440,
    fetchPort : 88,
    amqp : {
        host: "127.0.0.1",
        login: 'guest',
        password: 'guest'
    },
    'longPolling' : {
        timeout : 60000 //ms
    }
}