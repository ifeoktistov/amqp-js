var port = 88;
var http = require('http');
var url = require('url');
var fs = require('fs');
var qs = require('querystring');
var amqp = require('./libs/amqp/amqp');
var cp = require('child_process');
//var amqp_js = require('./libs/amqpjs');


/* process message from server */
process.on('message', function(m) {
    process.send('CHILD got message:' + m); //redirect message
});

/*

load config

 var apacheconf = require('apacheconf');
 apacheconf('/etc/apache2/sites-enabled/******', function(err, config, parser) {
     if (err) throw err

     amqpJs.toConsole(objToString(config,5));
 })
 */


var amqpJs = amqpJs || {};
amqpJs.options = {
    host: "127.0.0.1",
    login: 'guest',
    password: 'guest'
};
amqpJs.clients = [];
amqpJs.users = {};
amqpJs.users.edited_users = {};
amqpJs.users.user = {}; // all users object
amqpJs._bufferQueue = [];
amqpJs.toConsole = function (msg) {
    if (process.send) {
        process.send(msg);
    }
    else {
        console.log(msg);
    }
}
/* statistic */
amqpJs.statistic = {};
amqpJs.statistic.counters = {
    'initConnections' : 0,
    'subscribeReceived' : 0,
    'fetchRequest' : 0
};
amqpJs.statistic.app = {
    'start' : '' //process.uptime()
};//new Date, Date.now(), process.hrtime(),
amqpJs.statistic.counters = {};
amqpJs.statistic.getStatistic = function () {};
amqpJs.statistic.sendStatistic = function () {};



////////amqpJs.toConsole(process.memoryUsage());




////////////////////////// lib
amqpJs.users.handleUserClient = function handleUserClient(key, client) {
    //////amqpJs.toConsole("handle:" + key);
    if (typeof amqpJs.users.user[key] != "object") {
        amqpJs.users.user[key] = {};
    }
    if (typeof amqpJs.users.user[key].clients != "object") {
        amqpJs.users.user[key].clients = [];
    }
    amqpJs.users.user[key].clients.push(client);
};

amqpJs.users.addMessage = function addMessage(key, message) {
    amqpJs.users.edited_users[key] = 1;
    if (typeof amqpJs.users.user[key] != "object") {
        amqpJs.users.user[key] = {};
    }
    if (typeof amqpJs.users.user[key].messages != "object") {
        amqpJs.users.user[key].messages = {};
    }
    amqpJs.users.user[key].messages[message.id] = message;

    setTimeout((function (key, mid) {
        return function () {
            delete amqpJs.users.user[key].messages[mid];
        }
    })(key, message.id), 2000);


    ////////amqpJs.toConsole("add message:" + key + "messages length:" + Object.keys(amqpJs.users.user[key].messages).length);
};

amqpJs.users.sendNewMessages = function sendNewMessages() {
    ////////amqpJs.toConsole(amqpJs.users.edited_users);
    var send_messages = [];
    for (var key in amqpJs.users.edited_users) {
        if (amqpJs.users.edited_users.hasOwnProperty(key)) {
            //key = id user with new messages
            if (typeof amqpJs.users.user[key].clients == "object") {
                for (var i in amqpJs.users.user[key].clients) {
                    if (typeof amqpJs.users.user[key].clients[i].response != "undefined") {
                        var last_send_message_id = 0;
                        var last_client_message_id = amqpJs.users.user[key].clients[i].last_message;

                        send_messages = [];
                        for (var id_mes in amqpJs.users.user[key].messages) {
                            if (id_mes > last_client_message_id) {
                                send_messages.push(amqpJs.users.user[key].messages[id_mes]);
                                //if (id_mes > last_send_message_id) {
                                last_send_message_id = id_mes;
                                //}
                            }
                        }

                        if (send_messages != []) {
                            amqpJs.users.user[key].clients[i].response.writeHead(200, {'Content-Type': 'application/json'});
                            amqpJs.users.user[key].clients[i].response.end(JSON.stringify({
                                'data': send_messages,
                                'last_message': last_send_message_id
                            }));
                            delete amqpJs.users.user[key].clients[i].response;
                            delete amqpJs.users.user[key].clients[i];
                            //////amqpJs.toConsole("tm=" + ++tm);
                        }

                    }
                }
            }
        }
    }
    amqpJs.users.edited_users = {};
};

amqpJs.get_files = function (pathname, response) {
    fs.readFile('./client' + pathname, function (err, data) {
        if (!err) {
            if (pathname.indexOf('.js') != -1) {
                response.writeHead(200, {'Content-Type': 'text/javascript'});
            } else if (pathname.indexOf('.html') != -1) {
                response.writeHead(200, {'Content-Type': 'text/html'});
            } else if (pathname.indexOf('.css') != -1) {
                response.writeHead(200, {'Content-Type': 'text/css'});
            }
            response.end(data);
        } else {
            response.writeHead(404, {'Content-Type': 'text/html'});
            response.end('404 NOT FOUND');
        }
    });
};

http.createServer(function (request, response) {
    var urlparts = url.parse(request.url, true);
    switch (urlparts.pathname) {
        case '/fetch':
            if(request.method=='POST') {
                var body = '';
                request.on('data', function (data) {
                    body += data;
                });
                request.on('end', function(){
                    amqpJs.statistic.counters.fetchRequest++;
                    response.setHeader("Access-Control-Allow-Origin", "*"); //todo check security

                    var POST = qs.parse(body);
                    var id = POST['uid'];
                    var client = new Object();

                    client.last_message = (typeof POST['lmid'] != "undefined") ? parseInt(POST['lmid'], 10) : -1;
                    client.response = response;
                    ////////amqpJs.toConsole(id + ' waits for some messages');

                    amqpJs.clients.push(client);
                    amqpJs.users.handleUserClient(id, client);
                });
            }
            break;
        default:
            amqpJs.get_files(urlparts.pathname, response);
            break;
    }
}).listen(port);


amqpJs.connectFilter = function cacheFilter(element, index, array) {
    return !(typeof element == "undefined" || typeof element.response == "undefined");
};
amqpJs.clearBadClients = function clearBadClients() {
    //clear bad clients
    var a = amqpJs.clients.length;
    amqpJs.clients = amqpJs.clients.filter(amqpJs.connectFilter);
    ////////amqpJs.toConsole("users count----------: " + a);
    //////amqpJs.toConsole("users count: " + amqpJs.clients.length + "/" + a);
    setTimeout(amqpJs.clearBadClients, 1000);
};
amqpJs.clearBadClients();


amqpJs.addBufferQueue = function addBufferQueue(json) {
    amqpJs._bufferQueue.push(json);
};
amqpJs.processBufferQueue = function processBufferQueue() {
    var len = amqpJs._bufferQueue.length;

    for(var i = 0; i < len; i++) { //todo move to shift
        amqpJs.processQueueMessage(amqpJs._bufferQueue.shift());
    }
    ////////amqpJs.toConsole('processBufferQueue:' + amqpJs._bufferQueue.length + ', start:' + len);
    amqpJs.users.sendNewMessages(); //todo add if
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
        amqpJs.users.addMessage(json.to, json);
        sended++;
        ////////amqpJs.toConsole("sended:" + sended);
        return true;
    }
    return false;
};

amqpJs.processBufferQueue();

amqpJs.initConnection = function () {
    amqpJs.statistic.counters.initConnections++;

    amqpJs.connection = function harness_createConnection() {
        return amqp.createConnection({
            host: amqpJs.options.host,
            login: amqpJs.options.login,
            password: amqpJs.options.password
        }, {defaultExchangeName: 'amq.topic'});
    }();

    amqpJs.connection.addListener('error', function (e) {
        amqpJs.toConsole('amqpJs.connection error');
        throw e;
    });
    amqpJs.connection.addListener('close', function (e) {
        amqpJs.initConnection();
    });
    amqpJs.connection.addListener('ready', function () {
        //////amqpJs.toConsole("connected to " + connection.serverProperties.product);
        var q = amqpJs.connection.queue('messages', {passive: false, autoDelete: true}, function (queue) {
            //////amqpJs.toConsole("Queue " + queue.name + " is open");
            q.subscribe({ack: false, prefetchCount: 1000 }, function (json, headers, deliveryInfo, message) {
                amqpJs.statistic.counters.subscribeReceived++;

                amqpJs.addBufferQueue(JSON.parse(json.data.toString()));
            });
        });
    });
};

amqpJs.initConnection();

/*
 process.addListener('exit', function () {
 assert.equal(3, recvCount);
 });
 //////amqpJs.toConsole('Server running at http://127.0.0.1:' + port + '/');
 */


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