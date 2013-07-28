"use strict";
var amqpJs = function(conf){
    var self = this;
    var start = true;
    var last_message_id = -1;

    var config = { //default
        'fetch_host' : null,
        'fetch_success' : function fetch_success(json){
            //code for success receiving user message
        },
        'fetch_error' : function fetch_error(){
            //code for error
        },
        'user' : null
    };

    //overwrite config
    for (var p in conf) {
        if (conf.hasOwnProperty(p)) {
            config[p] = conf[p];
        }
    }


    var fetch = function () {
        if (!start) {
            return false;
        }
        if (config.user == null || config.fetch_host == null) {
            alert("user or getch host not set");
            self.stop();
        }
        $.ajax({
            url: config.fetch_host,
            context: document.body,
            dataType: 'json',
            type: "POST",
            cache: false,
            data: {
                uid : config.user,
                lmid : last_message_id
            },
            success: function (result) {
                config.fetch_success(result.data);
                if (typeof result.last_message != "undefined") {
                    last_message_id = result.last_message;
                }
                fetch();
                //fetch();
            },
            error: function () {
                config.fetch_error();
                setTimeout(function () {
                    fetch();
                }, 1000);
            }
        });
        return true;
    };

    self.start = function start(){
        start = true;
        fetch();
    };

    self.stop = function stop(){
        start = false;
    };


    return self;
};