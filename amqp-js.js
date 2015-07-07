"use strict";
/* load modules */
var http = require('http');
var url = require('url');
var fs = require('fs');
var qs = require('querystring');
var amqp = require('./libs/amqp/amqp');
var auth = require('./libs/basic-auth');


var amqpJs = {};
amqpJs.options = (function (){
    //load config file
    var configPath = __dirname + "/config.js";
    if(typeof fs.existsSync == "undefined") {
        console.log("Error: Object #<Object> has no method 'existsSync'. go to google.com =).");
        process.exit(1);
    }
    if(!fs.existsSync(configPath)) {
        console.log("Error: Config doesn't exist; Please copy config.example.js -> config.js.");
        process.exit(1);
    }
    return require(configPath);
})();

amqpJs.toConsole = function (msg) {
    console.log(msg);
};

/* data */
amqpJs.data = {};
amqpJs.data.systemMessageId = 0;
amqpJs.data.clients = [];
amqpJs.data.users = {};
amqpJs.data.users.edited_users = {};
amqpJs.data.users.user = {}; // all users object
amqpJs.data._bufferQueue = [];

/* statistic */
amqpJs.statistic = {};
amqpJs.statistic.counters = {
    'initAMQPConnections' : 0,
    'subscribeReceived' : 0,
    'fetchRequest' : 0
};
amqpJs.statistic.app = function (){
    return {
        'memoryBytes': process.memoryUsage()
    }
};
amqpJs.statistic.getStatistic = function () {
    return {
        time : Date.now(),
        counters: amqpJs.statistic.counters,
        app: amqpJs.statistic.app(),
        uptimeSec: process.uptime()
    };
};


amqpJs.data.users.handleUserClient = function handleUserClient(id, client) {
    if (typeof amqpJs.data.users.user[id] != "object") {
        amqpJs.data.users.user[id] = {};
    }
    if (typeof amqpJs.data.users.user[id].clients != "object") {
        amqpJs.data.users.user[id].clients = [];
    }
    amqpJs.data.users.user[id].clients.push(client);

    // timeout polling connections
    setTimeout((function(client){
        return function() {
            if (typeof client.response == "undefined" || typeof client.response.writeHead == "undefined") {
                return false;
            }
            client.response.writeHead(200, {'Content-Type': 'application/json'});
            client.response.end(JSON.stringify({
                'timeout': true
            }));

            delete client.response;
        }
    })(client), amqpJs.options.longPolling.timeout);
};

amqpJs.data.users.addMessage = function addMessage(key, message) {
    amqpJs.data.users.edited_users[key] = 1;
    if (typeof amqpJs.data.users.user[key] != "object") {
        amqpJs.data.users.user[key] = {};
    }
    if (typeof amqpJs.data.users.user[key].messages != "object") {
        amqpJs.data.users.user[key].messages = {};
    }

    amqpJs.data.users.user[key].messages[amqpJs.data.systemMessageId] = message;

    setTimeout((function (key, mid) {
        return function () {
            delete amqpJs.data.users.user[key].messages[mid];
        }
    })(key, amqpJs.data.systemMessageId), 2000);

    amqpJs.data.systemMessageId++;
};

amqpJs.data.users.sendNewMessages = function sendNewMessages() {
    var send_messages = [];
    for (var key in amqpJs.data.users.edited_users) {
        if (amqpJs.data.users.edited_users.hasOwnProperty(key)) {
            //key = id user with new messages
            if (typeof amqpJs.data.users.user[key].clients == "object") {
                for (var i in amqpJs.data.users.user[key].clients) {
                    if (typeof amqpJs.data.users.user[key].clients[i].response != "undefined") {
                        var last_send_message_id = 0;
                        var last_client_message_id = amqpJs.data.users.user[key].clients[i].last_message;

                        send_messages = [];
                        for (var id_mes in amqpJs.data.users.user[key].messages) {
                            if (id_mes > last_client_message_id) {
                                send_messages.push(amqpJs.data.users.user[key].messages[id_mes]);
                                last_send_message_id = id_mes;
                            }
                        }

                        if (send_messages != []) {
                            amqpJs.data.users.user[key].clients[i].response.writeHead(200, {'Content-Type': 'application/json'});
                            amqpJs.data.users.user[key].clients[i].response.end(JSON.stringify({
                                'data': send_messages,
                                'last_message': last_send_message_id
                            }));

                            delete amqpJs.data.users.user[key].clients[i].response;
                            delete amqpJs.data.users.user[key].clients[i];
                        }
                    }
                }
            }
        }
    }
    amqpJs.data.users.edited_users = {};
};

amqpJs.startServer = function startServer() {
    http.createServer(function (request, response) {
        var urlparts = url.parse(request.url, true);
        switch (urlparts.pathname) {
            case '/fetch':
                if(request.method=='POST') {
                    var POST = '';
                    request.on('data', function (data) {
                        POST += data;
                    });
                    request.on('end', function(){
                        amqpJs.statistic.counters.fetchRequest++;
                        response.setHeader("Access-Control-Allow-Origin", "*"); //todo check security

                        try{
                            POST = qs.parse(POST);
                        }
                        catch(e) {
                            response.writeHead(400, {'Content-Type': 'text/html'});
                            response.end('POST parse error' + e.stringify());
                        }

                        if (typeof POST['uuid'] != "undefined") {
                            var id = POST['uuid'];
                            var client = new Object();

                            var lmid = (typeof POST['lmid'] != "undefined") ? parseInt(POST['lmid'], 10) : -1;
                            if (lmid > amqpJs.data.systemMessageId) {
                                lmid = 0;
                            }

                            client.last_message = lmid;
                            client.response = response;

                            amqpJs.data.clients.push(client);
                            amqpJs.data.users.handleUserClient(id, client);
                        }
                        else {
                            response.writeHead(400, {'Content-Type': 'text/html'});
                            response.end('POST does not have parameter uuid');
                        }
                    });
                }
                break;

            case '/manage':
                if (amqpJs.options.manage.userName == '' || amqpJs.options.manage.password == '') {
                    response.writeHead(405, {'Content-Type': 'text/html'});
                    response.end('Method Not Allowed');
                    break;
                }

                var credentials = auth(request);

                if (!credentials || credentials.name !== amqpJs.options.manage.userName || credentials.pass !== amqpJs.options.manage.password) {
                    response.writeHead(401, {
                        'WWW-Authenticate': 'Basic realm="Maybe it\'s wrong link"'
                    });
                    response.end();
                } else {
                    response.writeHead(200, {'Content-Type': 'text/html'});
                    response.end(JSON.stringify(amqpJs.statistic.getStatistic()));
                }
                break;
            default:
                response.writeHead(404, {'Content-Type': 'text/html'});
                response.end();
                break;
        }
    }).once('error', function (err) {
            console.log("amqpJs.startServer Error. Code = " + err.code);
            if (err.code == 'EADDRINUSE') {
                console.log(amqpJs.options.port + " port is occupied.");
            } else if (err.code == 'EACCES') {
                console.log("No access to port " + amqpJs.options.port + ".");
            }
            console.log("Exit.");
            process.exit(1);
        }).listen(amqpJs.options.port);
};

amqpJs.clearBadClients = function clearBadClients() {
    amqpJs.data.clients = amqpJs.data.clients.filter(
        function (element, index, array) {
            return !(typeof element == "undefined" || typeof element.response == "undefined");
        }
    );

    setTimeout(amqpJs.clearBadClients, 1000);
};

amqpJs.addBufferQueue = function addBufferQueue(json) {
    amqpJs.data._bufferQueue.push(json);
};

amqpJs.processBufferQueue = function processBufferQueue() {
    var len = amqpJs.data._bufferQueue.length;

    for(var i = 0; i < len; i++) { //todo move to shift
        amqpJs.processQueueMessage(amqpJs.data._bufferQueue.shift());
    }

    amqpJs.data.users.sendNewMessages(); //todo add if
    setTimeout(amqpJs.processBufferQueue,200);
};

amqpJs.processQueueMessage = function processQueueMessage(json) {
    if (typeof json == "string") { //id
        json = JSON.parse(json);
    }
    if (typeof json != "object") { //id
        return false;
    }
    if (Object.prototype.toString.call(json) === '[object Array]') {
        for (var p in json) {
            if (json.hasOwnProperty(p) && typeof json[p] == "object") {
                amqpJs.processQueueMessage(json[p]);
            }
        }
        return true;
    }
    if (typeof json.to == "string") { //key
        amqpJs.data.users.addMessage(json.to, json);
        return true;
    }
    return false;
};

amqpJs.initQueueConnection = function () {
    amqpJs.statistic.counters.initAMQPConnections++;

    amqpJs.connection = function harness_createConnection() {
        return amqp.createConnection({
            host: amqpJs.options.amqp.host,
            login: amqpJs.options.amqp.login,
            password: amqpJs.options.amqp.password
        }, {defaultExchangeName: 'amq.topic'});
    }();

    amqpJs.connection.addListener('error', function (e) {
        amqpJs.toConsole('amqpJs.connection error');
        amqpJs.initQueueConnection();
    });

    amqpJs.connection.addListener('close', function (e) {
        amqpJs.initQueueConnection();
    });

    amqpJs.connection.addListener('ready', function () {
        var q = amqpJs.connection.queue(amqpJs.options.amqp.queue, {passive: false, autoDelete: true}, function (queue) {
            q.subscribe({ack: false, prefetchCount: 1000 }, function (json, headers, deliveryInfo, message) {
                amqpJs.statistic.counters.subscribeReceived++;

                amqpJs.addBufferQueue(JSON.parse(json.data.toString()));
            });
        });
    });
};


amqpJs.startServer();
amqpJs.initQueueConnection();
amqpJs.clearBadClients();
amqpJs.processBufferQueue();
