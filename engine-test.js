const { Worker } = require('worker_threads');
const path = require('path');

const w = new Worker(path.join(__dirname, 'engine-shim-worker.js'));

const done = setTimeout(() => { console.log('RESULT: TIMEOUT'); process.exit(1); }, 45000);

w.on('message', (m) => {
    const line = String(m).trim();
    if (line && !line.startsWith('info')) console.log('ENGINE:', line.slice(0, 80));
    if (line.includes('uciok')) w.postMessage('position startpos');
    if (line.includes('uciok')) w.postMessage('go movetime 1500');
    if (line.startsWith('bestmove')) {
        console.log('RESULT: ENGINE WORKS - bestmove', line.split(' ')[1]);
        clearTimeout(done);
        process.exit(0);
    }
});

w.on('error', (e) => { console.log('RESULT: WORKER ERROR', e.message); process.exit(1); });
setTimeout(() => w.postMessage('uci'), 500);
