var port = 88;




// include required modules
var http = require('http');
var sys = require('util');
var url = require('url');
var fs = require('fs');
var crypto = require('crypto');
var qs = require('querystring');

var util =  require('util');
var assert =  require('assert');
var amqp = require('./libs/amqp/amqp');
var puts = console.log;


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
//connection.removeAllListeners('error');

var clients = [];

var messages = [];

var history = [];

http.createServer(function (request, response) {
	var urlparts = url.parse(request.url, true);

	switch (urlparts.pathname) {
		/**
		 * Called form client with parameter "username"
		 * Returns an unique md5 hash
		 */
		case '/register':
			// generate very unique hash for the user
			var hash = crypto.createHash('md5');
			hash.update(urlparts.query['username']);
			var md5 = hash.digest('hex');
			break;
		case '/push':
			// replace " with \" (" will destroy the beautiful json)
			var message = urlparts.query['m'].replace(/"/gi, '\\"');

			// create json and push to message stack
			messages.push('{"user":"' + urlparts.query['u'] + '","time":"' + 
					new Date().getTime().toString() + '","message":"' + message + '"}');

			// we have all we need, close the connection
			response.writeHead(200, {'Content-Type': 'text/plain'});
			response.end('thx\n');

			console.log('client pushed new message, total messages: ' + messages.length);

			send();
			break;
		case '/fetchall':
			var answer = '';
			for (var i = 0; i < messages.length; i++) {
				answer = answer + messages[i] + ',';
			}

			// add last messageid to userhistory
			history[urlparts.query['u']] = i;

			console.log(urlparts.query['u'] + ' fetched all messages');

			response.writeHead(200, {'Content-Type': 'text/plain'});
			response.end('[' + answer.substring(0, answer.length - 1) + ']');
			break;
		case '/fetch':
			var lastmessageid = history[urlparts.query['u']];
			if (lastmessageid == undefined) {
				// history entry was never made, create a new one
				lastmessageid = history[urlparts.query['u']] = 0;
			}

			// check for messages
			if (messages.length > lastmessageid) {
				// we got new messages for you
				var answer = '';
				for (var i = lastmessageid; i < messages.length; i++) {
					answer = answer + messages[i] + ',';
				}

				// add last messageid to userhistory
				history[urlparts.query['u']] = i;

				console.log(urlparts.query['u'] + ' fetched some messages');

				response.writeHead(200, {'Content-Type': 'text/plain'});
				response.end('[' + answer.substring(0, answer.length - 1) + ']');
			} else {
				// add client to waitinglist
				var client = new Object();
				client.u = urlparts.query['u'];
				client.response = response;

				console.log(urlparts.query['u'] + ' waits for some messages');

				clients.push(client);
			}
			break;
		default:
			// check if file exists
			fs.readFile('./client' + urlparts.pathname, function (err, data) {
				if (!err) {
					if (urlparts.pathname.indexOf('.js') != -1) {
						response.writeHead(200, {'Content-Type': 'text/javascript'});
					} else if (urlparts.pathname.indexOf('.html') != -1) {
						response.writeHead(200, {'Content-Type': 'text/html'});
					} else if (urlparts.pathname.indexOf('.css') != -1) {
						response.writeHead(200, {'Content-Type': 'text/css'});
					}
					response.end(data);
				} else {
					response.writeHead(404, {'Content-Type': 'text/html'});
					response.end('404 NOT FOUND');
				}
			});

			break;
	}
}).listen(port);

/**
 * Sends a message to all connected clients and closes
 * all the connections
 */
function send() {
	var newclients = [];
	var newhistory = [];

	for (var i = 0; i < clients.length; i++) {
		var client = clients[i];

		var lastmessageid = history[client.u];
		if (lastmessageid == undefined) {
			// history entry was never made, create a new one
			lastmessageid = history[client.u] = 0;
		}

		// check for messages
		if (messages.length > lastmessageid) {
			// we got new messages for you
			var answer = '';
			for (var j = lastmessageid; j < messages.length; j++) {
				answer = answer + messages[j] + ',';
			}

			// add last messageid to userhistory
			newhistory[client.u] = j;

			client.response.writeHead(200, {'Content-Type': 'text/plain'});
			client.response.end('[' + answer.substring(0, answer.length - 1) + ']');

			console.log(client.u + ' fetched some messages after waiting');
		} else {
			// let the client wait moar
			newclients.push(client);
			newhistory[client.u] = history[client.u];
		}
	}

	// overwrite client array
	clients = newclients;

	// overwrite history
	history = newhistory;
}


connection.addListener('ready', function () {
    puts("connected to " + connection.serverProperties.product);
    var q = connection.queue('node-json-queue', {passive: true, autodelete: false}, function(queue) {
        console.log("Queue " + queue.name + " is open");

        q.subscribe({ack: true, prefetchCount: 10 }, function (json, headers, deliveryInfo, message) {
            // create json and push to message stack
            messages.push('{"user":"' + "amqp" + '","time":"' +
                new Date().getTime().toString() + '","message":"' + json.data + '"}');

            send();
            message.acknowledge();
        });
    });
});

//connection.removeAllListeners('error');
process.addListener('exit', function () {
    assert.equal(3, recvCount);
});
console.log('Server running at http://127.0.0.1:' + port + '/');