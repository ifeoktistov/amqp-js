var amqpJsServer =  {};
amqpJsServer.workers = {};
amqpJsServer.workers.sourcePath = 'v.0.3';

var cluster = require("cluster");
cluster.setupMaster({
    exec : './' + amqpJsServer.workers.sourcePath + '/worker.js',
    /*args : ["--use", "https"],*/
    silent : true
});

if (cluster.isMaster) {
    console.log('I am master');
    cluster.fork();

    function messageHandler(msg) {
        console.log('PARENT got message:', msg);
    }

    Object.keys(cluster.workers).forEach(function(id) {
        cluster.workers[id].on('message', messageHandler);
    });

    /*
    setInterval(function(){
        Object.keys(cluster.workers).forEach(function(id) {
            cluster.workers[id].send(id);
        });
    }, 1000);*/

} else if (cluster.isWorker) {
    console.log('I am worker #' + cluster.worker.id);
}