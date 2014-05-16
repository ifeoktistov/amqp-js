"use strict";
var amqpJsServer =  {};

/* load modules */
var http = require('http');
var fs = require('fs');
var url = require('url');
var qs = require('querystring');
amqpJsServer.cluster = require("cluster");

/* configure */
amqpJsServer.workers = {};
amqpJsServer.workers.statistic = {};
amqpJsServer.workers.sourcePath = 'v.0.3.2';
amqpJsServer.options = (function (){
    var configPath = __dirname + '/' + amqpJsServer.workers.sourcePath + "/config.js";
    if(typeof fs.existsSync == "undefined") {
        console.log("Error: Object #<Object> has no method 'existsSync'. go to google.com =).");
        process.exit();
    }
    if(!fs.existsSync(configPath)) {
        console.log("Error: Config doesn't exist; Please copy config.example.js -> config.js.");
        process.exit();
    }
    return require(configPath);
})();
amqpJsServer.workers.messageHandler = function messageHandler(msg) {
    if (typeof msg['data'] != 'undefined') { //data object
        if (msg['data']['type'] == 'statistic') {
            amqpJsServer.workers.statistic[msg['data']['workerID']] = msg['data']['stat'];
        }
    }
    else { //just message
        console.log('PARENT got message:', msg);

    }
}

amqpJsServer.cluster.setupMaster({
    exec : __dirname + '/' + amqpJsServer.workers.sourcePath + '/worker.js',
    silent : true
});

if (!amqpJsServer.cluster.isMaster) {
    console.log('amqpJsServer.cluster is not Master');
    return 0;
}

amqpJsServer.cluster.fork();   //current version limited only one fork =)

Object.keys(amqpJsServer.cluster.workers).forEach(function(id) {
    amqpJsServer.cluster.workers[id].on('message', amqpJsServer.workers.messageHandler);
});
Object.keys(amqpJsServer.cluster.workers).forEach(function(id) {
    amqpJsServer.cluster.workers[id].send({
        setId: id
    });
});


//up management server
http.createServer(function (request, response) {
    var urlparts = url.parse(request.url, true);
    switch (urlparts.pathname) {
        case '/manage':
            /*if(request.method == 'POST') {
                var POST = '';
                request.on('data', function (data) {
                    POST += data;
                });
                request.on('end', function(){
                    POST = qs.parse(POST);
                    //var id = POST['uid'];
                });
            }*/
            response.writeHead(200, {'Content-Type': 'text/html'});
            var count = '';
            var content = '';
            Object.keys(amqpJsServer.cluster.workers).forEach(function(id) {
                amqpJsServer.cluster.workers[id].send({
                    'action':'getStatistic'
                });
                count += id;
            });
            content += 'server count: ' + count + '<br/>' + "\r\n";
            content += 'server: ' + JSON.stringify({
                'platform': process.platform,
                'arch': process.arch,
                'node_version': process.version

            }) + '<br/>' + "\r\n";

            setTimeout( //todo fix timeout workaround for wait workers statistic
                function() {
                    content += 'workers: ' + JSON.stringify(amqpJsServer.workers.statistic) + "\r\n";
                    response.end(content);
                },
                500
            );
            break;
        default:
            amqpJsServer.get_files(urlparts.pathname, response);
            break;
    }
}).listen(amqpJsServer.options.managePort);




amqpJsServer.get_files = function (pathname, response) {
    fs.readFile(__dirname + '/' + amqpJsServer.workers.sourcePath + '/client' + pathname, function (err, data) {
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