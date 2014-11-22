/**
 * Created by Newton on 2014/11/22.
 */
var PORT = 8888;
var ROOT = process.cwd();
var http = require('http');
var nativeAssets = require('./native-assets');
var serveStatic = require('serve-static');
var send = serveStatic(ROOT, {
    index: ['index.html', 'index.htm'],
    maxAge: 60000
});

// Create server
var httpServer = http.createServer(function (req, res){
    res.setHeader('Server', 'NodeServer/0.0.1');

    send(req, res, function (err){
        if (err === null) {
            res.writeHead(404, {
                'Content-Type': 'text/html'
            });

            res.end(nativeAssets(ROOT, '/status/404/404.html'));
        } else {
            res.writeHead(500, {
                'Content-Type': 'text/plain'
            });

            res.end(err);
        }
    });
});

httpServer.listen(PORT);

console.log('Server runing at port: ' + PORT + '.');
