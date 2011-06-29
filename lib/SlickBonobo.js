/*!
 * Slick Bonobo
 * Copyright(c) 2011 Dan Brook <broq@cpan.org>
 * MIT Licensed
 */

/**
 * Library version.
 */

exports.version = '0.0.1';

exports.SlickBonobo = SlickBonobo;

var http = require('http'),
   jsdom = require('jsdom');

function SlickBonobo () {
  http.createServer(function(request, response) {

    var proxy        = http.createClient(80, request.headers['host'])
    var proxyRequest = proxy.request(request.method, request.url, request.headers);

    proxyRequest.addListener('response', function (proxyResponse) {
      var len        = parseInt(proxyResponse.headers['content-length']),
          hasContent = len > 0;
      var body = '';
      console.log('Totalling responding to', request.url, 'with', proxyResponse.headers);

      proxyResponse.addListener('data', function(chunk) {
        body += chunk;
      });
      proxyResponse.addListener('end', function() {
        console.log("Fini!");
        if(!hasContent) {
          response.writeHead(proxyResponse.statusCode, proxyResponse.headers);
          response.end();
          return
        }

        var realBody;
        jsdom.env({
            html:  body,
            scripts: ['http://code.jquery.com/jquery-1.5.min.js'],
            done: function(e, w) {
              if(e) console.log('Errors:', e);

              w.$('#footer-beta-feedback').append('<span>Woo woo!</span>');
              realBody = w.document.innerHTML;
              proxyResponse.headers['content-length'] = String(realBody.length);
              response.writeHead(proxyResponse.statusCode, proxyResponse.headers);
              response.write(realBody, 'binary');
              response.end();
            }
        });
      });
    });

    request.addListener('data', function(chunk) {
      console.log('request data ...');
      proxyRequest.write(chunk, 'binary');
    });
    request.addListener('end', function() {
      console.log('request end ...');
      proxyRequest.end();
    });

  }).listen(8080);
  console.log('Proxy now listening on port 8080');
}
