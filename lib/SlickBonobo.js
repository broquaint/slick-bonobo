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

var http = require('http');
function SlickBonobo () {
  http.createServer(function(request, response) {

    var proxy        = http.createClient(80, request.headers['host'])
    var proxyRequest = proxy.request(request.method, request.url, request.headers);

    var tail = "<!-- That's a wrap people! -->\n";

    proxyRequest.addListener('response', function (proxyResponse) {
      var len        = parseInt(proxyResponse.headers['content-length']),
          hasContent = len > 0;
      if(hasContent)
        proxyResponse.headers['content-length'] = String(len + tail.length)

      var body = '';
      console.log('Totalling responding to', request.url, 'with', proxyResponse.headers);

      proxyResponse.addListener('data', function(chunk) {
        body += chunk;
      });
      proxyResponse.addListener('end', function() {
        console.log("Fini!");
        if(hasContent)
          response.write(body + tail, 'binary');
        response.end();
      });
      response.writeHead(proxyResponse.statusCode, proxyResponse.headers);
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
