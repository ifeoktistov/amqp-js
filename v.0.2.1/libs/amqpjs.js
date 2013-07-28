/*
var config = { //default config
    'fetch_port' : 88,
    'amqp' : {
        'host': "",
        'port': "",
        ''
    },

};


exports.amqp = {};
exports.amqp.connection = function harness_createConnection() {
    return amqp.createConnection({host: "127.0.0.1"}, {defaultExchangeName: 'amq.topic'});
}();


exports.amqp.connection.addListener('error', function (e) {
    throw e;
});
exports.amqp.connection.addListener('close', function (e) {
    console.log('connection closed.');
});
exports.amqp.connection.addListener('ready', function () {
    console.log("connected to " + connection.serverProperties.product);
    var q = connection.queue('aaa1', {passive: true, autodelete: true}, function (queue) {
        console.log("Queue " + queue.name + " is open");
        q.subscribe({ack: false, prefetchCount: 10 }, function (json, headers, deliveryInfo, message) {
            console.log(json);
            console.log(typeof  json);
            console.log(JSON.parse(json.data.toString()));
            amqpJs.processQueueMessage(JSON.parse(json.data.toString()));
            amqpJs.users.sendNewMessages();
        });
    });
});


exports.setConfig = function (config){

};*/
