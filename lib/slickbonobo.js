/*!
 * slick-bonobo
 * Copyright(c) 2014 Dan Brook <dan@broquaint.com>
 * MIT Licensed
 */

/**
 * Library version.
 */

exports.version = '0.0.1';

var  http = require('http'),
      url = require('url'),
    jsdom = require('jsdom'),
        _ = require('underscore'),
       fs = require('fs'),
       vm = require('vm'),
     zlib = require('zlib'),
  context = require('./context');
;

function SlickBonobo (opts) {
    this.config = opts.config;
}

module.exports = SlickBonobo;

SlickBonobo.go = function(opts) {
    var config = context.loadAndValidateFile(opts.config_path || conf.get('config_path'));

    // TODO Have this reloaded on each attempted response.
    var sb = new SlickBonobo({config: config});
    sb.start();
};

SlickBonobo.prototype = {
    constructor: SlickBonobo,

    start: function(args) {
        this.server = http.createServer(
            _.bind(this.requestHandler, this)
        );
        this.server.on('connection', _.bind(this.connectionHandler, this));
        
        this.server.listen(8080);

        _.bindAll(this, 'proxyRequestHandler');
        console.log('Proxy now listening on port 8080');
    },

    connectionHandler: function(socket) {
        // Always include localhost for testing ease.
        var allowedIPs = this.config.get('allowedIPs').concat('127.0.0.1'),
            remoteAddr = socket.remoteAddress;
        if(allowedIPs.indexOf(remoteAddr) == -1) {
            console.log('Request from unknown IP, dropping:', remoteAddr);
            socket.destroy();
        }
    },

    requestHandler: function(request, response) {
        console.log('Got a request for', request.url);

        // The proxy request.
        var options      = _.extend({
                method:  request.method,
                headers: request.headers
            }, url.parse(request.url)),
            handler      = _.partial(this.proxyRequestHandler, request, response),
            proxyRequest = http.request(options, handler);

        proxyRequest.on('error', function(err) {
            console.log('Oh dear, something went wrong requesting '+request.url+' - ', err);
        });
        proxyRequest.end();
    },

    proxyRequestHandler: function(request, response, proxyResponse) {
        new SlickBonobo.ProxyResponse({
            request:       request,
            response:      response,
            proxyResponse: proxyResponse,
            // XXX This could suck less.
            config:        this.config.get('PageMunger')
        }).handleResponse();
    }
};

SlickBonobo.ProxyResponse = function(opts) {
    this.request    = opts.request;
    this.response   = opts.response;
    this.proxy      = opts.proxyResponse;

    this.bodyParts  = [];

    this.pageMunger = new SlickBonobo.PageMunger(opts.config);

    _.bindAll(
        this,
        'endHandler',  'jsdomDoneHandler',
        'applyMunger', 'finalizeResponse'  // zlib handlers
    );
};

SlickBonobo.ProxyResponse.prototype = {
    get requestUrl() { return this.request.url },
    get proxyHeaders() { return this.proxy.headers },
    get hasContent() { return parseInt(this.proxy.headers['content-length']) > 0 },

    handleResponse: function () {
        var self = this;
        this.proxy.addListener('data', function(chunk) { self.bodyParts.push(chunk); });
        this.proxy.addListener('end', this.endHandler);
    },

    endHandler: function() {
        var contentType = this.proxyHeaders['content-type'];

        if(!this.hasContent
        || contentType.indexOf('text/html') != 0
        || !this.pageMunger.shouldRunOn(this.requestUrl)) {
            console.log('Cowardly refusing to handle', this.requestUrl, '[', contentType, ']');
            this.response.writeHead(this.proxy.statusCode, this.proxyHeaders);
            this.response.write(
                Buffer.concat(this.bodyParts),
                'binary'
            );
            this.response.end();
            return;
        }

        switch(this.proxyHeaders['content-encoding']) {
            case 'gzip':
            case 'deflate':
                zlib.unzip(
                    Buffer.concat(this.bodyParts), this.applyMunger
                );
                break;
            default:
                this.applyMunger(null, this.bodyParts.join(''));
                break;
        }
    },

    applyMunger: function(err, body) {
        if(err) throw err;

        var bodyStr = body.toString(); // It's a Buffer at this point.
        jsdom.env({
            html:    bodyStr,
            done:    this.jsdomDoneHandler
        });
    },

    jsdomDoneHandler: function(err, window) {
        if(err) throw err;

        var mungedWindow = this.pageMunger.runScriptsOn(this, window);

        this.updateResponse(mungedWindow.document.innerHTML);
    },

    updateResponse: function(finalBody) {
        switch(this.proxyHeaders['content-encoding']) {
            case 'gzip':
                zlib.gzip(finalBody, this.finalizeResponse);
                break;
            case 'deflate':
                zlib.deflate(finalBody, this.finalizeResponse);
                break;
            default:
                this.finalizeResponse(null, finalBody);
                break;
        }
    },

    finalizeResponse: function(err, outgoingBody) { 
        if(err) throw err;

        // Ensure Content-Length reflects munged document.
        this.proxyHeaders['content-length'] = String(outgoingBody.length);
        this.response.writeHead(this.proxy.statusCode, this.proxyHeaders);

        this.response.write(outgoingBody, 'binary');
        this.response.end();
    }
};

// TODO Better name.
SlickBonobo.PageMunger = function(config) {
    _.extend(this, config);
    this.userScripts = this._setupScripts(config.userScripts);
};

SlickBonobo.PageMunger.prototype = {
    scriptsToRun: function(url) {
        return this.userScripts.filter(function (script) {
            return script.shouldRunOn(url);
        });
    },
    shouldRunOn: function(url) {
        return this.scriptsToRun(url).length > 0;
    },
    runScriptsOn: function (ctx, window) {
        var toRun = this.scriptsToRun(ctx.requestUrl);

        if(toRun.length == 0)
            return window;

        // If we use window directly it's not suitable consumption for
        // runInNewContext (for reasons beyond my ken).
        var vmContext = _.extend({
            require: require
        }, window);
        // Override existing console property with real console.
        vmContext.console = console;

        toRun.forEach(function (userScript) {
            console.log('Running:',userScript.path,'on',ctx.requestUrl);
            try {
                vm.runInNewContext(userScript.source, vmContext, userScript.path);
            } catch(e) {
                console.log('Problem running', userScript.path, '-', e);
            }
        });

        return vmContext;
    },

    // http://wiki.greasespot.net/Metadata_Block
    _setupScripts: function (scripts) {
        return scripts.map(function (s) {
            return new SlickBonobo.UserScript(s);
        });
    }
};

SlickBonobo.UserScript = function (opts) {
    _.extend(this, opts);
    this.source = fs.readFileSync(opts.path);
};

SlickBonobo.UserScript.prototype = {
    // TODO Handle globbing etc.
    shouldRunOn: function (urlToRunOn) {
        return this.include.some(function (includeUrl) {
            return includeUrl == urlToRunOn;
        });
    }
};
