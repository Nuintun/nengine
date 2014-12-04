Nengine
==========

>A static node http server

Getting started
==========

### Install

```bash
$ npm install nengine
```
`
Note: nengine require nengine-cli
`

### Introduction

if you have installed `nengine-cli` and `nengine`, you can run nengine by command:

```
$ nengine
```
and use:
```
$ nengine -h
```
for help.

you can config server by `nengine.json` under server root:
```json
{
    "port": 80,
    "directory": "allow",
	"dotFiles": "deny",
	"maxAge": 2592000,
	"index": ["index.html"],
	"extensions": ["html"],
	"etag": true,
	"lastModified": true,
	"range": [0, 1023],
	"status": {
	    "404": "/error/404.html",
	    "default": "/error/default.html"
	}
}
```

`port`: server port. `{Number}`

`directory`: show directory, you can set "allow", "deny", "ignore". `{String}`

`dotFiles`: show dot file, like directory. `{String}`

`maxAge`: set max-age, unit: seconds and also you can set like "2 days". `{Number|String}`

`index`: set default document. `{Array|String}`

`extensions`: set default extname, program will automatic add extname. `{Array|String}`

`etag`: set etag. `{Boolean}`

`lastModified`: set lastModified. `{Boolean}`

`range`: set file stream range, if it is not necessary to do not set. `{Array}`

`status`: set custom error page. `{Object}`
