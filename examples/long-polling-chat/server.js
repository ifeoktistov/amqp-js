/**
 * Copyright (C) 2011 benn0r <benjamin@benn0r.ch>
 * 
 * This file is part of benn0rchat.
 * 
 * benn0rchat is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 * 
 * benn0rchat is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 * 
 * You should have received a copy of the GNU General Public License
 * along with benn0rchat. If not, see <http://www.gnu.org/licenses/>.
 */

/**
 * Chat Server
 * 
 * @author benn0r <admin@benn0r.ch>
 * @since 2011/12/20
 * @version 2011/12/21
 */

// include required modules
var http = require('http');
var sys = require('util');
var url = require('url');
var fs = require('fs');
var crypto = require('crypto');
var qs = require('querystring');

/**
 * port for the server
 * 
 * @var int
 */
var port = 88;

/**
 * list with all the clients are waiting for messages
 * 
 * @var array responseobjects
 */
var clients = [];

/**
 * contains all pushed messages
 * 
 * @var array<string> json
 */
var messages = [];

/**
 * key is userid and content is the last
 * from user received messageid
 * 
 * @var int last received messageid
 */
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

console.log('Server running at http://127.0.0.1:' + port + '/');
