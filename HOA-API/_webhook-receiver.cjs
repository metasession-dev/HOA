// Tiny test receiver for Phase 9.2 webhook deliveries.
// Logs each call to ./_receiver.log so the smoke test can assert.
const http = require('http');
const fs = require('fs');

const PORT = 7088;
const LOG = '_receiver.log';
fs.writeFileSync(LOG, '');

http.createServer((req, res) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const body = Buffer.concat(chunks).toString();
    const entry = {
      at: new Date().toISOString(),
      method: req.method,
      url: req.url,
      headers: req.headers,
      body,
    };
    fs.appendFileSync(LOG, JSON.stringify(entry) + '\n');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
  });
}).listen(PORT, '127.0.0.1', () => {
  console.log(`receiver listening on :${PORT}`);
});
