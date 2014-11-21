var PORT = 8888,
    http = require('http'),
    url = require('url'),
    fs = require('fs'),
    mime = require('mime'),
    path = require('path');

var server = http.createServer(function (request, response){
    var pathname = url.parse(request.url).pathname,
        realPath = path.join(__dirname, pathname);

    fs.exists(realPath, function (exists){
        if (!exists) {
            fs.readFile('Assets/404/404.html', 'binary', function (err, file){
                if (err) {
                    response.writeHead(500, {
                        'Content-Type': 'text/plain'
                    });

                    response.end(err);
                } else {
                    response.writeHead(404, {
                        'Content-Type': 'text/html'
                    });

                    response.write(file, 'binary');
                    response.end();
                }
            });
        } else {
            fs.stat(realPath, function (err, stats){
                if (err) {
                    response.writeHead(500, {
                        'Content-Type': 'text/plain'
                    });

                    response.end(err);
                } else {
                    var ext;

                    realPath = stats.isFile() ? realPath : realPath + 'index.html';
                    ext = path.extname(realPath);
                    ext = ext ? ext.slice(1) : 'unknown';

                    fs.readFile(realPath, 'binary', function (err, file){
                        if (err) {
                            response.writeHead(500, {
                                'Content-Type': 'text/plain'
                            });

                            response.end(err);
                        } else {
                            var contentType = mime.lookup(ext) || 'text/plain';

                            response.writeHead(200, {
                                'Content-Type': contentType
                            });

                            response.write(file, 'binary');
                            response.end();
                        }
                    });
                }
            });
        }
    });
});

server.listen(PORT);

console.log('Server runing at port: ' + PORT + '.');