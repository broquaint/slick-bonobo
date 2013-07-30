/*!
 * slick-bonobo
 * Copyright(c) 2013 Dan Brook <dan@broquaint.com>
 * MIT Licensed
 */

/**
 * Library version.
 */

exports.version = '0.0.1';

var  http = require('http'),
    jsdom = require('jsdom'),
        _ = require('underscore');

function SlickBonobo () {
    this.server = http.createServer(_.bind(this.newServer, this));
}

exports.SlickBonobo = SlickBonobo;

SlickBonobo.prototype = {
    go: function() {
        this.server.listen(8080);
        console.log('Proxy now listening on port 8080');
    },

    newServer: function(request, response) {
        var proxy        = http.createClient(80, request.headers.host),
            proxyRequest = proxy.request(request.method, request.url, request.headers);

        proxyRequest.addListener('response', function(proxyResponse) {
            var p = new SlickBonobo.ProxyResponse(request, response, proxyResponse);
            p.handleResponse();
        });

        request.addListener('data', function(chunk) {
            console.log('request data ...');
            proxyRequest.write(chunk, 'binary');
        });
        request.addListener('end', function() {
            console.log('request end ...');
            proxyRequest.end();
        });
    }
};

SlickBonobo.ProxyResponse = function(request, response, proxy) {
    this.request    = request;
    this.response   = response;
    this.proxy      = proxy; // a proxyResponse

    this.body       = '';
    this.hasContent = parseInt(this.proxy.headers['content-length']) > 0;

    _.bindAll(this, 'endHandler', 'jsdomDoneHandler');
};

SlickBonobo.ProxyResponse.prototype = {
    handleResponse: function () {
        console.log('Totally responding to', this.request.url, 'with', this.proxy.headers);

        var self = this;
        this.proxy.addListener('data', function(chunk) { self.body += chunk; });
        this.proxy.addListener('end', this.endHandler);
    },

    endHandler: function() {
        console.log("Fini!");
        // Or content != text/html
        if(!this.hasContent) {
            this.response.writeHead(this.proxy.statusCode, this.proxy.headers);
            this.response.end();
            return;
        }

        console.log('I am ', this);
        jsdom.env({
            html:    this.body,
            scripts: ['http://code.jquery.com/jquery-2.0.3.min.js'],
            done:    this.jsdomDoneHandler
        });
    },

    jsdomDoneHandler: function(err, window) {
        if(err)
            throw err;

        console.log('Window = ', window);

        window.$('.copy').append('<span>Woo woo!</span>');
        var realBody = window.document.innerHTML;
        this.proxy.headers['content-length'] = String(realBody.length);
        this.response.writeHead(this.proxy.statusCode, this.proxy.headers);
        this.response.write(realBody, 'binary');
        this.response.end();
    }
};
