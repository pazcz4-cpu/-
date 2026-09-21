/* שרת סטטי מינימלי לבדיקות מקומיות של site/.
   הרצה: node tools/serve.js [port] [dir] */
'use strict';
var http = require('http');
var fs = require('fs');
var path = require('path');

var port = Number(process.argv[2]) || 4173;
var base = path.resolve(process.argv[3] || path.join(__dirname, '..', 'site'));

var TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.txt': 'text/plain; charset=utf-8'
};

var server = http.createServer(function (req, res) {
  var url = decodeURIComponent(req.url.split('?')[0]);
  var file = path.join(base, url);
  if (!file.startsWith(base)) { res.writeHead(403).end(); return; }
  fs.stat(file, function (err, stat) {
    if (!err && stat.isDirectory()) { file = path.join(file, 'index.html'); }
    fs.readFile(file, function (readErr, body) {
      if (readErr) { res.writeHead(404, { 'Content-Type': 'text/plain' }).end('not found: ' + url); return; }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
      res.end(body);
    });
  });
});

server.listen(port, function () { console.log('serving ' + base + ' on http://localhost:' + port); });
