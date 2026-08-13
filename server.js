const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;
const ROOT = __dirname;

const MIME = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.wasm': 'application/wasm',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
};

http.createServer((req, res) => {

    // POST /api/save-config: writes the Supabase URL + anon key into config.js
    if (req.method === 'POST' && req.url.startsWith('/api/save-config')) {
        let body = '';
        req.on('data', (chunk) => { body += chunk; });
        req.on('end', () => {
            let data;
            try {
                data = JSON.parse(body);
            } catch (e) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ ok: false, error: 'bad json' }));
            }
            const url = String(data.SUPABASE_URL || '').trim();
            const key = String(data.SUPABASE_KEY || '').trim();
            if (!url.includes('supabase.co') || !key) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ ok: false, error: 'invalid values' }));
            }
            const js = "// Supabase config (written by setup form)\nwindow.CHESS_CONFIG = {\n    SUPABASE_URL: " + JSON.stringify(url) + ",\n    SUPABASE_KEY: " + JSON.stringify(key) + "\n};\n";
            fs.writeFile(path.join(ROOT, 'config.js'), js, (err) => {
                if (err) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    return res.end(JSON.stringify({ ok: false, error: 'write failed' }));
                }
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: true }));
            });
        });
        return;
    }

    let urlPath = decodeURIComponent(req.url.split('?')[0]);
    if (urlPath === '/') urlPath = '/index.html';

    const filePath = path.join(ROOT, urlPath);
    if (!filePath.startsWith(ROOT)) {
        res.writeHead(403);
        return res.end('Forbidden');
    }

    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404);
            return res.end('Not found');
        }
        // Never cache: guarantees the browser always loads the latest code and
        // stale copies can never be served (prevents "old version" bugs).
        res.writeHead(200, {
            'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream',
            'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
            'Pragma': 'no-cache',
            'Expires': '0',
        });
        res.end(data);
    });
}).listen(PORT, () => {
    console.log('Chess AI running at http://localhost:' + PORT);
    console.log('Open your browser and go to that address.');
});
