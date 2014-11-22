var PORT = 8888,
    http = require('http'),
    url = require('url'),
    fs = require('fs'),
    mime = require('mime'),
    path = require('path');

function notFound(response){
    var filepath = path.join(process.cwd(), 'Assets/404/404.html'),
        stream = fs.createReadStream(filepath);

    response.writeHead(404, {
        'Content-Type': 'text/html'
    });

    stream.pipe(response);
}

function serverError(response){
    response.writeHead(500, {
        'Content-Type': 'text/plain'
    });

    response.end(err);
}

var server = http.createServer(function (request, response){
    var pathname = url.parse(request.url).pathname,
        realPath = path.join(process.cwd(), pathname);

    fs.exists(realPath, function (exists){
        if (!exists) {
            notFound(response);
        } else {
            fs.stat(realPath, function (err, stats){
                if (err) {
                    serverError(response);
                } else {
                    var ext,
                        stream,
                        contentType;

                    if (stats.isFile()) {
                        ext = path.extname(realPath);
                        ext = ext ? ext.slice(1) : 'unknown';
                        stream = fs.createReadStream(realPath);
                        contentType = mime.lookup(ext) || 'text/plain';

                        response.writeHead(200, {
                            'Content-Type': contentType
                        });

                        stream.pipe(response);
                    } else {
                        notFound(response);
                    }

                }
            });
        }
    });
});

server.listen(PORT);

console.log('Server runing at port: ' + PORT + '.');