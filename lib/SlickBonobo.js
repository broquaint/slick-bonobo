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
        _ = require('underscore'),
       fs = require('fs'),
       vm = require('vm'),
     zlib = require('zlib')
;

function SlickBonobo (opts) {
    this.config = opts.config;

    this.server = http.createServer(
        _.bind(this.requestHandler, this)
    );
    this.server.on('connection', _.bind(this.connectionHandler, this));
}

exports.SlickBonobo = SlickBonobo;

SlickBonobo.go = function(opts) {
    var config = JSON.parse(
        fs.readFileSync(opts.config_path, 'utf-8')
    );

    // Check early for sanity even though it's not a great separation of concerns.
    if(!config.PageMunger && !config.PageMunger.userScripts)
        throw 'No PageMunger.userScripts found in: ' + opts.config_path;

    if(!config.allowedIPs)
        throw 'No allowedIPs found in: ' + opts.config_path;

    // TODO Have this reloaded on each attempted response.
    var sb = new SlickBonobo({config: config});

    sb.server.listen(8080);

    console.log('Proxy now listening on port 8080');
};

SlickBonobo.prototype = {
    connectionHandler: function(socket) {
        // Always include localhost for testing ease.
        var allowedIPs = this.config.allowedIPs.concat('127.0.0.1'),
            remoteAddr = socket.remoteAddress;

        if(allowedIPs.indexOf(remoteAddr) == -1) {
            console.log('Request from unknown IP, dropping:', remoteAddr);
            socket.destroy();
        }
    },

    requestHandler: function(request, response) {
        console.log('Got a request for', request.url);

        var proxyRequest = http.request(request),
            sbConfig     = this.config;

        proxyRequest.addListener('response', function(proxyResponse) {
            new SlickBonobo.ProxyResponse({
                request:       request,
                response:      response,
                proxyResponse: proxyResponse,
                // XXX This could suck less.
                config:        sbConfig
            }).handleResponse();
        });

        request.addListener('data', function(chunk) {
            proxyRequest.write(chunk, 'binary');
        });
        request.addListener('end', function() {
            proxyRequest.end();
        });
    }
};

SlickBonobo.ProxyResponse = function(opts) {
    this.request    = opts.request;
    this.response   = opts.response;
    this.proxy      = opts.proxyResponse;

    this.bodyParts  = [];

    this.pageMunger = new SlickBonobo.PageMunger(opts.config.PageMunger);

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
        // Or content != text/html

        if(!this.hasContent || this.proxyHeaders['content-type'] != 'text/html') {
            console.log('Cowardly refusing to handle', this.proxyHeaders['content-type']);
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
            // TODO Have as userscript dep.
            scripts: ['http://code.jquery.com/jquery-2.0.3.min.js'],
            done:    this.jsdomDoneHandler
        });
    },

    jsdomDoneHandler: function(err, window) {
        if(err)
            throw err;

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
    runScriptsOn: function (ctx, window) {
        var toRun = this.userScripts.filter(function (script) {
            return script.shouldRunOn(ctx.requestUrl);
        });

        // If we use window directly it's not suitable consumption for
        // runInNewContext (for reasons beyond my ken).
        var vmContext = _.extend({}, window);

        toRun.forEach(function (userScript) {
            vm.runInNewContext(userScript.source, vmContext, userScript.path);
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
