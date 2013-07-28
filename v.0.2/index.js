var port = 88;
var http = require('http');
var url = require('url');
var fs = require('fs');

var util =  require('util');
var assert =  require('assert');
var amqp = require('./libs/amqp/amqp');


var connection = function harness_createConnection() {
    return amqp.createConnection(
        {
            host : "localhost"
        },
        {
            defaultExchangeName: 'amq.topic'
        }
    );
}();

connection.addListener('error', function(e) {
    throw e;
});

connection.addListener('close', function (e) {
    console.log('connection closed.');
});

var amqp_js = {};
amqp_js.clients = {};
amqp_js.clients_data = {};
amqp_js._cache = [];
amqp_js.cache_exp = 1000;


var __c = [];
amqp_js.cacheFilter = function cacheFilter(element, index, array) {
    return (element != null && typeof element.exp != "undefined");
}
amqp_js.toCache = function (json) {
    var j = clone(json);
    j.exp = new Date().getTime() + amqp_js.cache_exp;
    amqp_js._cache.push(j);
    console.log("start amqp_js.purgeCache");
};
amqp_js.purgeCache = function () {
    var now = new Date().getTime();


    //console.log("start amqp_js.purgeCache, in cache:" + amqp_js._cache.length);
    if (__c != JSON.stringify(amqp_js._cache)) {
        console.log(" cache:" + JSON.stringify(amqp_js._cache));
    }
    __c = JSON.stringify(amqp_js._cache);


    var now = new Date().getTime();

    for (var i = 0; i < amqp_js._cache.length; i++) {
        if(amqp_js._cache[i] && amqp_js._cache[i].exp > now) {
            delete amqp_js._cache[i].exp;
            amqp_js.processQueueMessage(clone(amqp_js._cache[i]),false);
            delete amqp_js._cache[i];
        }
    }
    amqp_js._cache = amqp_js._cache.filter(amqp_js.cacheFilter);
};
setInterval(amqp_js.purgeCache, amqp_js.cache_exp / 2);

amqp_js.get_files = function (pathname,response){
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

function clone(obj){
    if(obj == null || typeof(obj) != 'object')
        return obj;

    var temp = obj.constructor(); // changed

    for(var key in obj)
        temp[key] = clone(obj[key]);
    return temp;
};

function objToString (obj,level) {
    return 0;
    if (typeof obj != "object" || level > 5) {
        return String(obj);
    }
    var str = '';
    for (var p in obj) {
        if (obj.hasOwnProperty(p)) {
            str += p + '::' + objToString( obj[p] ,level +1) + '\n';
        }
    }
    return str;
}
http.createServer(function (request, response) {
	var urlparts = url.parse(request.url, true);
	switch (urlparts.pathname) {
		case '/fetch':
            var id = urlparts.query['u'];
            var client = new Object();
            //var bkey =
            client.response = response;
            console.log(id + ' waits for some messages');
            if (typeof amqp_js.clients[id] != "object") {
                amqp_js.clients[id] = [];
            }
            //if (typeof amqp_js.clients[id][bkey] != "object") {
            //    amqp_js.clients[id] = {};
            //}
            amqp_js.clients[id].push(client);
			break;
		default:
            amqp_js.get_files(urlparts.pathname, response);
			break;
	}
}).listen(port);


amqp_js.processQueueMessage = function processQueueMessage(json, use_cache){
    if (typeof json != "object") { //id
        return false;
    }

    if ( Object.prototype.toString.call( json ) === '[object Array]' ) {
        for (var p in json) {
            if (json.hasOwnProperty(p) && typeof json[p] == "object") {
                amqp_js.processQueueMessage(clone(json[p]),true);
            }
        }
        return true;
    }


    if (typeof json.to == "number") { //id

    }
//    DISABLED. Message for all user
//    else if (typeof json.to == "string" && json.to == "all") { //all
//        for (var p in amqp_js.clients) {
//            if (amqp_js.clients.hasOwnProperty(p)) {
//                if (typeof amqp_js.clients[p] == "object" && Object.keys(amqp_js.clients[p]).length > 0) { //user is online
//                    console.log("connection in user " + p + " - " + Object.keys(amqp_js.clients[p]).length);
//                    for (var i = 0; i < amqp_js.clients[p].length; i++) {
//                        if (typeof amqp_js.clients[p][i].response != "undefined") {
//                            amqp_js.clients[p][i].response.writeHead(200, {'Content-Type': 'application/json'});
//                            amqp_js.clients[p][i].response.end(JSON.stringify(json));
//                            delete amqp_js.clients[p][i];
//                            console.log(json.to + ' fetched some messages after waiting');
//                        }
//                        else {
//                            amqp_js.toCache(json);
//                        }
//                    }
//                }
//                else if(use_cache){ //to log
//                    amqp_js.toCache(json);
//                }
//            }
//        }
//    }
    else if (typeof json.to == "string"){ //key
        if (typeof amqp_js.clients[json.to] != "undefined" &&
            amqp_js.clients[json.to].length > 0) {
            console.log("connection in user " + json.to + " - " + amqp_js.clients[json.to].length);
            for (var i = 0; i < amqp_js.clients[json.to].length; i++) {
                if (typeof amqp_js.clients[json.to][i] != "undefined") {

                    amqp_js.clients[json.to][i].response.writeHead(200, {'Content-Type': 'application/json'});
                    amqp_js.clients[json.to][i].response.end(JSON.stringify(json));
                    delete amqp_js.clients[json.to][i];
                    console.log(json.to + ' fetched some messages after waiting');
                }
                else if(use_cache && typeof json == "object"){ //to log
                    console.log('amqp_js.toCache 1 ');
                    amqp_js.toCache(json);
                }
            }

            amqp_js.clients[json.to] = amqp_js.clients[json.to].filter(amqp_js.cacheFilter);
        }
        else if(use_cache && typeof json == "object"){ //to log
            console.log('amqp_js.toCache 2 ');
            amqp_js.toCache(json);
        }
    }
    else { //error

    }

    console.log("users count: " + Object.keys(amqp_js.clients).length);
    return true;
};


connection.addListener('ready', function () {
    console.log("connected to " + connection.serverProperties.product);
    var q = connection.queue('node-json-queue', {passive: true, autodelete: true}, function(queue) {
        console.log("Queue " + queue.name + " is open");
        q.subscribe({ack: false, prefetchCount: 10 }, function (json, headers, deliveryInfo, message) {
            amqp_js.processQueueMessage(JSON.parse(json.data.toString()));
        });
    });
});

process.addListener('exit', function () {
    assert.equal(3, recvCount);
});
console.log('Server running at http://127.0.0.1:' + port + '/');