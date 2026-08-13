const { parentPort } = require('worker_threads');
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const code = fs.readFileSync(path.join(__dirname, 'vendor', 'stockfish.js'), 'utf8');

const sendToParent = (data) => parentPort.postMessage(data);

const sandbox = {
    console,
    Math, Date, Array, Object, String, Number, Boolean, RegExp, Error, TypeError, Infinity, NaN, undefined,
    Int8Array, Uint8Array, Uint8ClampedArray, Int16Array, Uint16Array, Int32Array, Uint32Array,
    Float32Array, Float64Array, DataView, Map, Set, Promise, JSON, parseInt, parseFloat, isNaN,
    postMessage: sendToParent,
    importScripts: () => {},
    location: { href: 'http://localhost:3000/' },
    performance: { now: () => Date.now() },
    process: undefined,
    Buffer: undefined,
    require: undefined,
    module: undefined,
    setTimeout, clearTimeout, setInterval, clearInterval,
    atob: (b) => Buffer.from(b, 'base64').toString('binary'),
    btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
};
sandbox.self = sandbox;

vm.createContext(sandbox);
vm.runInContext(code, sandbox);

let onmsg = sandbox.onmessage;
if (typeof onmsg !== 'function') { parentPort.postMessage('NO_ONMESSAGE'); process.exit(1); }

parentPort.on('message', (m) => onmsg({ data: m }));

setTimeout(() => { parentPort.postMessage('SHIM_TEST_DONE'); process.exit(0); }, 30000);
