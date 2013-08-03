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
       vm = require('vm')
;

function SlickBonobo () {
    this.server = http.createServer(
        _.bind(this.newServer, this)
    );
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
//            console.log('request data ...');
            proxyRequest.write(chunk, 'binary');
        });
        request.addListener('end', function() {
//            console.log('request end ...');
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

    this.pageMunger = new SlickBonobo.PageMunger({
        config_path: '/home/dbrook/dev/Slick-Bonobo/example-config.json'
    });

    _.bindAll(this, 'endHandler', 'jsdomDoneHandler');
};

SlickBonobo.ProxyResponse.prototype = {
    get requestUrl() { return this.request.url },
    get proxyHeaders() { return this.proxy.headers },

    handleResponse: function () {
//      console.log('Totally responding to', this.request.url, 'with', this.proxyHeaders);

        var self = this;
        this.proxy.addListener('data', function(chunk) { self.body += chunk; });
        this.proxy.addListener('end', this.endHandler);
    },

    endHandler: function() {
//        console.log("Fini!");
        // Or content != text/html
        if(!this.hasContent) {
            this.response.writeHead(this.proxy.statusCode, this.proxyHeaders);
            this.response.end();
            return;
        }

        jsdom.env({
            html:    this.body,
            // TODO Have as userscript dep.
            scripts: ['http://code.jquery.com/jquery-2.0.3.min.js'],
            done:    this.jsdomDoneHandler
        });
    },

    jsdomDoneHandler: function(err, window) {
        if(err)
            throw err;

        var mungedWindow = this.pageMunger.runScriptsOn(this, window),
                realBody = mungedWindow.document.innerHTML;

        this.proxyHeaders['content-length'] = String(realBody.length);
        this.response.writeHead(this.proxy.statusCode, this.proxyHeaders);
        this.response.write(realBody, 'binary');
        this.response.end();
    }
};

// TODO Better name.
SlickBonobo.PageMunger = function(opts) {
    var config = JSON.parse(
        fs.readFileSync(opts.config_path, 'utf-8')
    );
    _.extend(this, config); // Not used currently.

    if(!config.userScripts)
        throw 'No userScripts found in: ' + opts.config_path;

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
