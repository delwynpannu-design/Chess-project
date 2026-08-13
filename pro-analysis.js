import { Chess } from './vendor/chess.js';

const boardEl = document.getElementById('board');
const statusEl = document.getElementById('status');
const movesEl = document.getElementById('moves');
const toStartBtn = document.getElementById('to-start');
const prevBtn = document.getElementById('prev');
const nextBtn = document.getElementById('next');
const toEndBtn = document.getElementById('to-end');
const moveCounterEl = document.getElementById('move-counter');
const verdictEl = document.getElementById('verdict');
const barWhiteEl = document.getElementById('eval-bar-white');
const overlayEl = document.getElementById('progress-overlay');
const progressFillEl = document.getElementById('progress-fill');
const progressTextEl = document.getElementById('progress-text');

const SVG_NS = 'http://www.w3.org/2000/svg';
let svgEl = null;
let lastMoveTo = null;

const BADGE_COLORS = {
    best: '#4ade80',
    great: '#4ade80',
    good: '#86efac',
    inaccuracy: '#fbbf24',
    mistake: '#fb923c',
    blunder: '#f87171',
};

let moves = [];
let savedStatus = '';
try {
    const data = JSON.parse(localStorage.getItem('chess_analysis') || 'null');
    if (data && Array.isArray(data.moves)) {
        moves = data.moves;
        savedStatus = data.status || '';
    }
} catch (e) { /* fall through to empty game */ }

let current = 0;
let analyses = []; // analyses[j] = analysis of position P_j

const PIECE_CHARS = {
    w: { k: '\u2654', q: '\u2655', r: '\u2656', b: '\u2657', n: '\u2658', p: '\u2659' },
    b: { k: '\u265A', q: '\u265B', r: '\u265C', b: '\u265D', n: '\u265E', p: '\u265F' },
};

function toAlgebraic(row, col) {
    return String.fromCharCode(97 + col) + (8 - row);
}

// ---- Stockfish engine ----
const engine = new Worker('vendor/stockfish.js');
let engineReady = false;
let pending = null;
let waitResolve = null;

engine.onmessage = (e) => {
    const line = typeof e.data === 'string' ? e.data : (e.data && e.data.data) || '';
    handleEngine(line);
};
engine.onerror = () => {
    if (waitResolve) { waitResolve(); waitResolve = null; }
    fail('Engine failed to load. Please reload the page.');
};
engine.postMessage('uci');

function handleEngine(line) {
    if (line.includes('uciok')) {
        engineReady = true;
        if (waitResolve) { waitResolve(); waitResolve = null; }
        return;
    }
    if (!pending) return;
    if (line.startsWith('info')) {
        const m = line.match(/score\s+(cp|mate)\s+(-?\d+)/);
        if (m) pending.info = m[1] === 'mate' ? { mate: +m[2] } : { cp: +m[2] };
    } else if (line.startsWith('bestmove')) {
        const parts = line.split(' ');
        const best = parts[1] === '(none)' ? null : parts[1];
        const info = pending.info || { cp: 0 };
        const p = pending;
        pending = null;
        p.resolve({ best, info });
    }
}

function waitEngine() {
    if (engineReady) return Promise.resolve();
    return new Promise((res) => {
        waitResolve = res;
        setTimeout(() => {
            if (!engineReady) {
                waitResolve = null;
                fail('Engine not responding. Reload the page and try again.');
                res();
            }
        }, 20000);
    });
}

function analyze(fen) {
    return new Promise((resolve) => {
        pending = { info: null, resolve };
        engine.postMessage('position fen ' + fen);
        engine.postMessage('go movetime 200 depth 12');
    });
}

function fail(msg) {
    overlayEl.classList.add('hidden');
    statusEl.textContent = msg;
    statusEl.className = 'status';
}

async function runAnalysis() {
    if (moves.length === 0) {
        render();
        return;
    }
    overlayEl.classList.remove('hidden');
    await waitEngine();
    if (!engineReady) return;

    const total = moves.length + 1;
    analyses = new Array(total);
    const g = new Chess();
    try {
        for (let j = 0; j < total; j++) {
            const fen = g.fen();
            const side = g.turn();
            const r = await analyze(fen);
            analyses[j] = { best: r.best, info: r.info, side };
            progressFillEl.style.width = (100 * (j + 1) / total) + '%';
            progressTextEl.textContent = (j + 1) + ' / ' + total;
            if (j < moves.length) g.move(moves[j]);
        }
    } catch (e) {
        fail('Analysis failed.');
        return;
    }
    overlayEl.classList.add('hidden');
    render();
}

// ---- Move quality ----
function toCp(info) {
    return info.mate != null ? (info.mate > 0 ? 10000 : -10000) : info.cp;
}

function uciOfMove(i) {
    const g = new Chess();
    for (let k = 0; k < i; k++) g.move(moves[k]);
    const v = g.moves({ verbose: true }).find((m) => m.san === moves[i]);
    if (!v) return null;
    let u = v.from + v.to;
    if (v.promotion) u += v.promotion;
    return u;
}

function classify(i) {
    const a0 = analyses[i];
    const a1 = analyses[i + 1];
    if (!a0 || !a1) return { cls: 'unknown', sym: '', label: '' };
    const loss = toCp(a0.info) + toCp(a1.info);
    let sameMove = false;
    if (a0.best) {
        try { sameMove = uciOfMove(i) === a0.best; } catch (e) {}
    }
    if (sameMove) return { cls: 'best', sym: '!', label: 'Best move' };
    if (loss <= 0.25) return { cls: 'great', sym: '', label: 'Great move' };
    if (loss <= 0.8) return { cls: 'good', sym: '', label: 'Good move' };
    if (loss <= 1.6) return { cls: 'inaccuracy', sym: '!?', label: 'Inaccuracy' };
    if (loss <= 3.0) return { cls: 'mistake', sym: '?', label: 'Mistake' };
    return { cls: 'blunder', sym: '??', label: 'Blunder' };
}

// ---- Rendering ----
function buildBoard(game) {
    boardEl.innerHTML = '';
    const grid = document.createElement('div');
    grid.className = 'board-grid';

    const squares = game.board();
    const lastMove = current > 0 ? game.history({ verbose: true }).pop() : null;
    lastMoveTo = lastMove ? lastMove.to : null;

    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            const square = document.createElement('div');
            const isLight = (row + col) % 2 === 0;
            square.className = 'square ' + (isLight ? 'light' : 'dark');
            square.dataset.square = toAlgebraic(row, col);

            if (lastMove && (square.dataset.square === lastMove.from || square.dataset.square === lastMove.to)) {
                square.classList.add('last-move');
            }

            const piece = squares[row][col];
            if (piece) {
                const span = document.createElement('span');
                span.textContent = PIECE_CHARS[piece.color][piece.type];
                span.style.fontSize = 'clamp(28px, 7.5cqw, 52px)';
                span.style.lineHeight = '1';
                if (piece.color === 'w') {
                    span.style.color = '#ffffff';
                    span.style.webkitTextStroke = '1.5px #20242c';
                } else {
                    span.style.color = '#16181d';
                    span.style.webkitTextStroke = '1px #d9dee6';
                }
                span.style.textShadow = piece.color === 'w' ? '0 1px 3px rgba(0,0,0,0.55)' : 'none';
                square.appendChild(span);
            }

            grid.appendChild(square);
        }
    }

    boardEl.appendChild(grid);

    svgEl = document.createElementNS(SVG_NS, 'svg');
    svgEl.setAttribute('class', 'board-svg');
    boardEl.appendChild(svgEl);
}

function drawBadge() {
    if (!lastMoveTo || current === 0) return;
    const c = classify(current - 1);
    if (c.cls === 'unknown') return;
    const sqEl = boardEl.querySelector('.square[data-square="' + lastMoveTo + '"]');
    if (!sqEl) return;
    const boardRect = boardEl.getBoundingClientRect();
    const r = sqEl.getBoundingClientRect();
    const sq = r.width || 60;
    const cx = r.left - boardRect.left + r.width - sq * 0.13;
    const cy = r.top - boardRect.top + sq * 0.13;
    const radius = sq * 0.11;

    const circle = document.createElementNS(SVG_NS, 'circle');
    circle.setAttribute('cx', cx);
    circle.setAttribute('cy', cy);
    circle.setAttribute('r', radius);
    circle.setAttribute('fill', BADGE_COLORS[c.cls] || '#22c55e');
    svgEl.appendChild(circle);

    if (c.sym) {
        const txt = document.createElementNS(SVG_NS, 'text');
        txt.setAttribute('x', cx);
        txt.setAttribute('y', cy + sq * 0.04);
        txt.setAttribute('text-anchor', 'middle');
        txt.setAttribute('font-size', sq * 0.15);
        txt.setAttribute('font-weight', '800');
        txt.setAttribute('fill', '#0b0b0f');
        txt.textContent = c.sym;
        svgEl.appendChild(txt);
    }
}

function drawArrow() {
    if (!svgEl) return;
    svgEl.innerHTML = '';
    drawBadge();
    const a = analyses[current];
    const best = a && a.best;
    if (!best) return;

    const from = best.slice(0, 2);
    const to = best.slice(2, 4);
    const boardRect = boardEl.getBoundingClientRect();
    const fromEl = boardEl.querySelector('.square[data-square="' + from + '"]');
    const toEl = boardEl.querySelector('.square[data-square="' + to + '"]');
    if (!fromEl || !toEl) return;

    const fRect = fromEl.getBoundingClientRect();
    const tRect = toEl.getBoundingClientRect();
    const sq = fRect.width || 60;

    const x1 = fRect.left - boardRect.left + fRect.width / 2;
    const y1 = fRect.top - boardRect.top + fRect.height / 2;
    const x2 = tRect.left - boardRect.left + tRect.width / 2;
    const y2 = tRect.top - boardRect.top + tRect.height / 2;

    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy);
    if (len === 0) return;

    const ux = dx / len;
    const uy = dy / len;
    const stop = len - sq * 0.55;
    const ex = x1 + ux * stop;
    const ey = y1 + uy * stop;

    const head = sq * 0.36;
    const halfWidth = sq * 0.055;
    const px = -uy;
    const py = ux;
    const tipX = ex + ux * head * 0.35;
    const tipY = ey + uy * head * 0.35;
    const bx1 = ex - ux * head * 0.55 + px * halfWidth;
    const by1 = ey - uy * head * 0.55 + py * halfWidth;
    const bx2 = ex - ux * head * 0.55 - px * halfWidth;
    const by2 = ey - uy * head * 0.55 - py * halfWidth;

    const line = document.createElementNS(SVG_NS, 'line');
    line.setAttribute('x1', x1);
    line.setAttribute('y1', y1);
    line.setAttribute('x2', ex);
    line.setAttribute('y2', ey);
    line.setAttribute('stroke', '#22c55e');
    line.setAttribute('stroke-width', sq * 0.07);
    line.setAttribute('stroke-linecap', 'round');
    line.setAttribute('opacity', '0.9');

    const poly = document.createElementNS(SVG_NS, 'polygon');
    poly.setAttribute('points', tipX + ',' + tipY + ' ' + bx1 + ',' + by1 + ' ' + bx2 + ',' + by2);
    poly.setAttribute('fill', '#22c55e');
    poly.setAttribute('opacity', '0.9');

    svgEl.appendChild(line);
    svgEl.appendChild(poly);
}

function updateBar() {
    const a = analyses[current];
    let pct = 50;
    if (a && a.info) {
        const raw = toCp(a.info);
        const fromWhite = a.side === 'w' ? raw : -raw;
        pct = 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * fromWhite)) - 1);
        pct = Math.max(0, Math.min(100, pct));
    }
    barWhiteEl.style.height = pct + '%';
}

function applyCls(el, i) {
    const c = classify(i);
    if (c.cls !== 'unknown') {
        el.classList.add(c.cls);
        if (c.sym) el.textContent = moves[i] + c.sym;
    }
}

function renderMoveList() {
    movesEl.innerHTML = '';
    for (let i = 0; i < moves.length; i += 2) {
        const pair = document.createElement('div');
        pair.className = 'move-pair';
        const num = document.createElement('span');
        num.className = 'num';
        num.textContent = (i / 2 + 1) + '.';
        pair.appendChild(num);

        const white = document.createElement('span');
        white.textContent = moves[i];
        white.dataset.idx = i;
        white.className = 'move-link';
        applyCls(white, i);
        pair.appendChild(white);

        if (i + 1 < moves.length) {
            const black = document.createElement('span');
            black.textContent = moves[i + 1];
            black.dataset.idx = i + 1;
            black.className = 'move-link';
            applyCls(black, i + 1);
            pair.appendChild(black);
        }
        movesEl.appendChild(pair);
    }

    const activeIdx = current - 1;
    movesEl.querySelectorAll('.move-link').forEach((el) => {
        el.classList.toggle('active', parseInt(el.dataset.idx) === activeIdx);
    });
    const active = movesEl.querySelector('.move-link.active');
    if (active) active.scrollIntoView({ block: 'nearest' });
}

function updateStatus() {
    if (moves.length === 0) {
        statusEl.textContent = 'No moves to analyze yet. Play a game on the main page first.';
        statusEl.className = 'status';
    } else if (current === 0) {
        statusEl.textContent = 'Starting position.';
        statusEl.className = 'status';
    } else if (current === moves.length && savedStatus) {
        statusEl.textContent = savedStatus;
        statusEl.className = 'status';
    } else {
        statusEl.textContent = 'Viewing move ' + current + ' of ' + moves.length;
        statusEl.className = 'status';
    }
}

function updateVerdict() {
    if (moves.length === 0) {
        verdictEl.innerHTML = '';
        return;
    }
    if (current === 0) {
        verdictEl.innerHTML = 'Starting position';
        return;
    }
    const c = classify(current - 1);
    const best = analyses[current - 1] && analyses[current - 1].best;
    if (c.cls !== 'unknown') {
        const bestText = best ? ' · Best: ' + best : '';
        verdictEl.innerHTML = '<span class="v-' + c.cls + '">' + moves[current - 1] + ' — ' + c.label +
            (c.sym ? ' (' + c.sym + ')' : '') + '</span>' + bestText;
    } else {
        verdictEl.innerHTML = best ? 'Best move here: <b>' + best + '</b>' : 'Analyzing...';
    }
}

function updateButtons() {
    moveCounterEl.textContent = current + ' / ' + moves.length;
    toStartBtn.disabled = current === 0;
    prevBtn.disabled = current === 0;
    nextBtn.disabled = current === moves.length;
    toEndBtn.disabled = current === moves.length;
}

function render() {
    const game = new Chess();
    for (let i = 0; i < current; i++) game.move(moves[i]);
    buildBoard(game);
    renderMoveList();
    updateStatus();
    updateVerdict();
    updateBar();
    drawArrow();
    updateButtons();
}

function goTo(index) {
    current = Math.max(0, Math.min(moves.length, index));
    render();
}

toStartBtn.addEventListener('click', () => goTo(0));
prevBtn.addEventListener('click', () => goTo(current - 1));
nextBtn.addEventListener('click', () => goTo(current + 1));
toEndBtn.addEventListener('click', () => goTo(moves.length));

movesEl.addEventListener('click', (e) => {
    const link = e.target.closest('.move-link');
    if (link) goTo(parseInt(link.dataset.idx) + 1);
});

window.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') { goTo(current - 1); e.preventDefault(); }
    else if (e.key === 'ArrowRight') { goTo(current + 1); e.preventDefault(); }
    else if (e.key === 'Home') { goTo(0); e.preventDefault(); }
    else if (e.key === 'End') { goTo(moves.length); e.preventDefault(); }
});

render();
runAnalysis();