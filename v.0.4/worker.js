"use strict";
var amqpJs = amqpJs || {};
amqpJs.worker = {};
amqpJs.worker.id = false;
amqpJs.toConsole = function (msg) {
    if (process.send) {
        process.send(msg);
    }
    else {
        console.log(msg);
    }
};

/* load modules */
var http = require('http');
var url = require('url');
var fs = require('fs');
var qs = require('querystring');
var amqp = require('./libs/amqp/amqp');


/* process message from server */
process.on('message', function(m) {
    if (typeof m['setId'] != "undefined") {
        amqpJs.worker.id = m['setId'];
        amqpJs.toConsole('Set worker ID: ' + amqpJs.worker.id); //redirect message
    }
    else if (typeof m['action'] != "undefined"){
        if ( m['action'] == 'getStatistic') {
            amqpJs.statistic.sendStatistic();
        }
    }
    else {
        amqpJs.toConsole('CHILD got message:' + m); //redirect message
    }
});


amqpJs.options = (function (){
    var configPath = __dirname + "/config.js";
    if(!fs.existsSync(configPath)) {
        amqpJs.toConsole("Error: Config doesn't exist; Please copy config.example.js -> config.js.");
        process.end();
    }
    return require(configPath);
})();

/* data */
amqpJs.data = {};
amqpJs.data.clients = [];
amqpJs.data.users = {};
amqpJs.data.users.edited_users = {};
amqpJs.data.users.user = {}; // all users object
amqpJs.data._bufferQueue = [];

/* statistic */
amqpJs.statistic = {};
amqpJs.statistic.counters = {
    'initConnections' : 0,
    'subscribeReceived' : 0,
    'fetchRequest' : 0
};
amqpJs.statistic.app = function (){
    return {
        'memory_bytes': process.memoryUsage()
    }
};
amqpJs.statistic.getStatistic = function () {
    return {
        time : Date.now(),
        counters: amqpJs.statistic.counters,
        app: amqpJs.statistic.app(),
        uptime: process.uptime()
    };
};
amqpJs.statistic.sendStatistic = function () {
    amqpJs.toConsole({
        data: {
            workerID: amqpJs.worker.id,
            type: 'statistic',
            stat: amqpJs.statistic.getStatistic()
        }
    });
};



////////////////////////// lib
amqpJs.data.users.handleUserClient = function handleUserClient(id, client) {
    //////amqpJs.toConsole("handle:" + key);
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

            delete client.response;//delete garbage
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
    amqpJs.data.users.user[key].messages[message.id] = message;

    setTimeout((function (key, mid) {
        return function () {
            delete amqpJs.data.users.user[key].messages[mid];
        }
    })(key, message.id), 2000);

};

amqpJs.data.users.sendNewMessages = function sendNewMessages() {
    ////////amqpJs.toConsole(amqpJs.data.users.edited_users);
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
                                //if (id_mes > last_send_message_id) {
                                last_send_message_id = id_mes;
                                //}
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
                            //////amqpJs.toConsole("tm=" + ++tm);
                        }
                    }
                }
            }
        }
    }
    amqpJs.data.users.edited_users = {};
};


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

                        client.last_message = (typeof POST['lmid'] != "undefined") ? parseInt(POST['lmid'], 10) : -1;
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
        default:
            response.writeHead(404, {'Content-Type': 'text/html'});
            response.end('404 NOT FOUND');
            break;
    }
}).listen(amqpJs.options.fetchPort);


amqpJs.clearBadClients = function clearBadClients() {
    //clear bad clients
    var a = amqpJs.data.clients.length;
    amqpJs.data.clients = amqpJs.data.clients.filter(
            function (element, index, array) {
            return !(typeof element == "undefined" || typeof element.response == "undefined");
        }
    );
    ////////amqpJs.toConsole("users count----------: " + a);
    //////amqpJs.toConsole("users count: " + amqpJs.data.clients.length + "/" + a);
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
    ////////amqpJs.toConsole('processBufferQueue:' + amqpJs.data._bufferQueue.length + ', start:' + len);
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
        //sended++;
        ////////amqpJs.toConsole("sended:" + sended);
        return true;
    }
    return false;
};

amqpJs.initConnection = function () {
    amqpJs.statistic.counters.initConnections++;

    amqpJs.connection = function harness_createConnection() {
        return amqp.createConnection({
            host: amqpJs.options.amqp.host,
            login: amqpJs.options.amqp.login,
            password: amqpJs.options.amqp.password
        }, {defaultExchangeName: 'amq.topic'});
    }();

    amqpJs.connection.addListener('error', function (e) {
        amqpJs.toConsole('amqpJs.connection error');
        amqpJs.initConnection();
        //throw e;
    });
    amqpJs.connection.addListener('close', function (e) {
        amqpJs.initConnection();
    });
    amqpJs.connection.addListener('ready', function () {
        //////amqpJs.toConsole("connected to " + connection.serverProperties.product);
        var q = amqpJs.connection.queue(amqpJs.options.amqp.queue, {passive: false, autoDelete: true}, function (queue) {
            //////amqpJs.toConsole("Queue " + queue.name + " is open");
            q.subscribe({ack: false, prefetchCount: 1000 }, function (json, headers, deliveryInfo, message) {
                amqpJs.statistic.counters.subscribeReceived++;

                amqpJs.addBufferQueue(JSON.parse(json.data.toString()));
            });
        });
    });
};

amqpJs.initConnection();
amqpJs.clearBadClients();
amqpJs.processBufferQueue();









//----------        helpers          --------------

function clone(obj) {
    if (obj == null || typeof(obj) != 'object')
        return obj;

    var temp = obj.constructor(); // changed

    for (var key in obj)
        temp[key] = clone(obj[key]);
    return temp;
};



function objToString(obj, level) {
    if (typeof obj != "object" || level > 10) {
        return obj.toString() + '\n';
    }

    var str = '';
    var pr = '\n';

    for(var i = 0; i < level; i++) {
        pr += '  ';
    }
    for (var p in obj) {
        if (obj.hasOwnProperty(p)) {
            str += pr + '' + p + '::' + objToString(obj[p], level + 1) + '\n';
        }
    }

    return str.replace(/\n+/g , "\n");
};