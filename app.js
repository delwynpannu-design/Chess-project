import { Chess } from './vendor/chess.js';

const game = new Chess();

// Expose so the analysis module can review the same game.
window.__chessGame = game;

let playerColor = 'w';
let strength = '20';
let selected = null;
let legalTargets = [];
let thinking = false;
let gameOver = false;
let gameStarted = false;

const boardEl = document.getElementById('board');
const statusEl = document.getElementById('status');
const evalEl = document.getElementById('eval');
const depthEl = document.getElementById('depth');
const movesEl = document.getElementById('moves');
const newGameBtn = document.getElementById('new-game');
const sideSelect = document.getElementById('side-select');
const strengthSelect = document.getElementById('strength-select');
const timeSelect = document.getElementById('time-select');
const clockWEl = document.getElementById('clock-w');
const clockBEl = document.getElementById('clock-b');
const timeWEl = document.getElementById('time-w');
const timeBEl = document.getElementById('time-b');
const promoModal = document.getElementById('promotion-modal');
const promoPiecesEl = document.getElementById('promo-pieces');

// ---- Clock / timer ----
let whiteMs = 0;
let blackMs = 0;
let lastTick = 0;
let clockTimer = null;
// Explicitly tracks whose clock should be draining. Set on every turn change so
// the wrong player is never charged, regardless of engine async timing.
let runningClock = null;

function formatClock(ms) {
    const total = Math.max(0, Math.ceil(ms / 1000));
    const m = Math.floor(total / 60);
    const s = total % 60;
    return m + ':' + String(s).padStart(2, '0');
}

function renderClock() {
    timeWEl.textContent = formatClock(whiteMs);
    timeBEl.textContent = formatClock(blackMs);
    clockWEl.classList.toggle('active', !gameOver && runningClock === 'w');
    clockBEl.classList.toggle('active', !gameOver && runningClock === 'b');
    clockWEl.classList.toggle('low', whiteMs < 60000);
    clockBEl.classList.toggle('low', blackMs < 60000);
}

function startClock() {
    if (gameOver || !gameStarted || clockTimer) return;
    if (!runningClock) runningClock = game.turn();
    lastTick = Date.now();
    clockTimer = setInterval(tickClock, 200);
}

function stopClock() {
    clearInterval(clockTimer);
    clockTimer = null;
}

// Called after every move / turn change so the clock cleanly switches to the
// side now to move (opponent). Also resets `lastTick` so no stale time bleeds
// across a turn boundary.
function onTurnChange() {
    runningClock = game.turn();
    lastTick = Date.now();
    if (!gameOver && gameStarted && !clockTimer) startClock();
}

function tickClock() {
    if (gameOver) {
        stopClock();
        renderClock();
        return;
    }
    const now = Date.now();
    const delta = now - lastTick;
    lastTick = now;
    if (runningClock === 'w') whiteMs = Math.max(0, whiteMs - delta);
    else blackMs = Math.max(0, blackMs - delta);
    renderClock();
    if (whiteMs <= 0 || blackMs <= 0) {
        gameOver = true;
        stopClock();
        const loser = whiteMs <= 0 ? 'White' : 'Black';
        statusEl.textContent = 'Time out! ' + loser + ' loses on time. ' + (loser === 'White' ? 'Black' : 'White') + ' wins.';
        statusEl.className = 'status win';
        selected = null;
        legalTargets = [];
        render();
    }
}

const PIECE_CHARS = {
    w: { k: '\u2654', q: '\u2655', r: '\u2656', b: '\u2657', n: '\u2658', p: '\u2659' },
    b: { k: '\u265A', q: '\u265B', r: '\u265C', b: '\u265D', n: '\u265E', p: '\u265F' },
};

const STRENGTH_TIME = { '2': 300, '6': 700, '12': 1500, '20': 2500 };

// ---- Stockfish engine (runs in a Web Worker so the page stays responsive) ----
const engine = new Worker('vendor/stockfish.js');
let engineReady = false;
let lastFen = '';

engine.onmessage = (e) => {
    const line = typeof e.data === 'string' ? e.data : (e.data && e.data.data) || '';
    handleEngineOutput(line);
};

engine.onerror = (e) => {
    engineReady = false;
    thinking = false;
    stopClock();
    statusEl.textContent = 'Engine failed to load. Please reload the page or try a different browser.';
    statusEl.className = 'status';
};

engine.postMessage('uci');
engine.postMessage('setoption name Skill Level value 20');

// If the engine hasn't initialized within 20s, tell the user instead of spinning forever.
setTimeout(() => {
    if (!engineReady) {
        thinking = false;
        stopClock();
        statusEl.textContent = 'Engine not responding. Reload the page and try again.';
        statusEl.className = 'status';
    }
}, 20000);

function handleEngineOutput(line) {
    if (!line) return;

    if (line.includes('uciok')) {
        engineReady = true;
        engine.postMessage('ucinewgame');
        return;
    }

    // best move from engine
    if (line.startsWith('bestmove')) {
        const best = line.split(' ')[1];
        if (best && best !== '(none)') {
            makeEngineMove(best);
        }
        return;
    }

    // analysis info
    if (line.startsWith('info')) {
        const depthMatch = line.match(/depth\s+(\d+)/);
        if (depthMatch) depthEl.textContent = 'Depth: ' + depthMatch[1];

        const scoreMatch = line.match(/score\s+(cp|mate)\s+(-?\d+)/);
        if (scoreMatch) {
            let evalText;
            if (scoreMatch[1] === 'mate') {
                evalText = 'Checkmate in ' + Math.abs(parseInt(scoreMatch[2])) + (scoreMatch[2] < 0 ? ' (for Black)' : ' (for White)');
            } else {
                const cp = parseInt(scoreMatch[2]) / 100;
                evalText = (cp >= 0 ? '+' : '') + cp.toFixed(2);
                if (game.turn() === 'b') evalText = (cp >= 0 ? '-' : '+') + Math.abs(cp).toFixed(2);
            }
            evalEl.textContent = evalText;
        }
    }
}

function askEngineMove() {
    if (!engineReady) {
        setTimeout(askEngineMove, 200);
        return;
    }
    thinking = true;
    statusEl.textContent = 'The Undefeated is thinking...';
    statusEl.className = 'status';
    lastFen = game.fen();
    engine.postMessage('position fen ' + lastFen);
    engine.postMessage('go movetime ' + STRENGTH_TIME[strength]);
}

function makeEngineMove(moveStr) {
    thinking = false;
    // Discard stale engine responses. A 'bestmove' may arrive late (e.g. from a
    // previous game's search after Reset). Apply it ONLY if the board is still
    // exactly the position we asked the engine to analyze and it really is the
    // engine's turn - otherwise a leftover Black reply could be dropped into the
    // game and let Black "move first" even when the human is White.
    if (!gameStarted || game.turn() === playerColor || game.fen() !== lastFen) return;
    const move = { from: moveStr.slice(0, 2), to: moveStr.slice(2, 4), promotion: moveStr.length > 4 ? moveStr[4] : undefined };
    game.move(move);
    render();
    checkEnd();
    saveAnalysis();
    onTurnChange();
}

// ---- Board rendering ----
function render() {
    boardEl.innerHTML = '';
    const grid = document.createElement('div');
    grid.className = 'board-grid';

    const squares = game.board();
    const lastMove = game.history({ verbose: true }).pop();

    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            const square = document.createElement('div');
            const isLight = (row + col) % 2 === 0;
            square.className = 'square ' + (isLight ? 'light' : 'dark');
            square.dataset.square = toAlgebraic(row, col);

            if (lastMove && (square.dataset.square === lastMove.from || square.dataset.square === lastMove.to)) {
                square.classList.add('last-move');
            }

            if (selected === square.dataset.square) square.classList.add('selected');
            if (legalTargets.includes(square.dataset.square)) {
                square.classList.add('hint');
                const hasPiece = squares[row][col] !== null;
                if (hasPiece) square.classList.add('capture');
            }

            const piece = squares[row][col];
            if (piece) {
                const span = document.createElement('span');
                span.textContent = PIECE_CHARS[piece.color][piece.type];
                span.style.fontSize = 'clamp(28px, 7.5cqw, 52px)';
                span.style.lineHeight = '1';
                span.style.pointerEvents = 'none';
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

            square.addEventListener('click', () => onSquareClick(square.dataset.square));
            grid.appendChild(square);
        }
    }

    boardEl.appendChild(grid);
    renderMoves();
}

// Persist the finished/current game so the analysis page can replay it.
function saveAnalysis() {
    try {
        localStorage.setItem('chess_analysis', JSON.stringify({
            moves: game.history(),
            status: statusEl.textContent
        }));
    } catch (e) { /* storage may be unavailable; analysis just won't show a game */ }
}

function toAlgebraic(row, col) {
    return String.fromCharCode(97 + col) + (8 - row);
}

// ---- Interaction ----
function onSquareClick(sq) {
    // `thinking` is intentionally NOT part of this gate: it only becomes true
    // while the engine is thinking, which is never the player's turn (so the
    // isPlayerTurn check already blocks input then). Including it risks a stale
    // flag silently blocking all piece moves.
    if (gameOver || !gameStarted || !isPlayerTurn()) return;

    const piece = game.get(sq);

    if (selected) {
        // try to move to target
        if (legalTargets.includes(sq)) {
            makePlayerMove(selected, sq);
            return;
        }
        // pick another of your own pieces
        if (piece && piece.color === playerColor) {
            selected = sq;
            legalTargets = game.moves({ square: sq, verbose: true }).map(m => m.to);
            render();
            return;
        }
        // deselect
        selected = null;
        legalTargets = [];
        render();
        return;
    }

    if (piece && piece.color === playerColor) {
        selected = sq;
        legalTargets = game.moves({ square: sq, verbose: true }).map(m => m.to);
        render();
    }
}

function makePlayerMove(from, to) {
    const verbose = game.moves({ square: from, verbose: true });
    const moveInfo = verbose.find(m => m.to === to);

    // promotion needed
    if (moveInfo && moveInfo.promotion) {
        selected = from;
        legalTargets = [to];
        showPromoModal(from, to);
        return;
    }

    game.move({ from, to });
    selected = null;
    legalTargets = [];
    render();
    checkEnd();
    saveAnalysis();
    onTurnChange();
}

function showPromoModal(from, to) {
    promoPiecesEl.innerHTML = '';
    ['q', 'r', 'b', 'n'].forEach(piece => {
        const btn = document.createElement('button');
        const span = document.createElement('span');
        span.textContent = PIECE_CHARS[playerColor][piece];
        span.style.fontSize = '40px';
        span.style.lineHeight = '1';
        span.style.color = playerColor === 'w' ? '#f8faf8' : '#1f2937';
        btn.appendChild(span);
        btn.addEventListener('click', () => {
            promoModal.classList.add('hidden');
            game.move({ from, to, promotion: piece });
            selected = null;
            legalTargets = [];
            render();
            checkEnd();
            saveAnalysis();
            onTurnChange();
        });
        promoPiecesEl.appendChild(btn);
    });
    promoModal.classList.remove('hidden');
}

function isPlayerTurn() {
    return game.turn() === playerColor;
}

// Visible banner so the player always knows the code's side assignment.
function renderColorBanner() {
    const el = document.getElementById('color-banner');
    if (!el) return;
    const engineColor = playerColor === 'w' ? 'b' : 'w';
    el.innerHTML =
        'YOU: <b>' + (playerColor === 'w' ? 'WHITE' : 'BLACK') + '</b> &nbsp;|&nbsp; ENGINE: <b>' +
        (engineColor === 'w' ? 'WHITE' : 'BLACK') + '</b><br><small>White always moves first &middot; v11</small>';
}

// ---- Game flow ----
function checkEnd() {
    if (game.isCheckmate()) {
        const winner = game.turn() === 'w' ? 'Black' : 'White';
        gameOver = true;
        stopClock();
        statusEl.textContent = 'Checkmate! ' + winner + ' wins.';
        statusEl.className = 'status win';
        return;
    }
    if (game.isStalemate()) {
        gameOver = true;
        stopClock();
        statusEl.textContent = 'Stalemate - draw.';
        statusEl.className = 'status';
        return;
    }
    if (game.isThreefoldRepetition() || game.isInsufficientMaterial() || game.isDraw()) {
        gameOver = true;
        stopClock();
        statusEl.textContent = 'Draw.';
        statusEl.className = 'status';
        return;
    }
    if (game.isCheck()) {
        statusEl.textContent = (game.turn() === 'w' ? 'White' : 'Black') + ' is in check!';
        statusEl.className = 'status check';
    } else {
        statusEl.textContent = game.turn() === 'w' ? "White to move" : "Black to move";
        statusEl.className = 'status';
    }
    if (!isPlayerTurn() && !gameOver) {
        setTimeout(askEngineMove, 400);
    }
}

function renderMoves() {
    movesEl.innerHTML = '';
    const history = game.history();
    const rows = [];
    for (let i = 0; i < history.length; i += 2) {
        const num = Math.floor(i / 2) + 1;
        const white = history[i];
        const black = history[i + 1];
        const pair = document.createElement('div');
        pair.className = 'move-pair';
        pair.innerHTML = '<span class="num">' + num + '.</span><span>' + (white || '') + '</span><span>' + (black || '') + '</span>';
        rows.push(pair);
    }
    rows.forEach(r => movesEl.appendChild(r));
    movesEl.scrollTop = movesEl.scrollHeight;
}

function resetGame() {
    game.reset();
    selected = null;
    legalTargets = [];
    gameOver = false;
    gameStarted = false;
    thinking = false;
    evalEl.textContent = '0.00';
    depthEl.textContent = 'Depth: 0';
    playerColor = sideSelect.value;
    strength = strengthSelect.value;
    whiteMs = parseInt(timeSelect.value) * 60000;
    blackMs = whiteMs;
    stopClock();
    runningClock = null;
    lastTick = Date.now();
    renderClock();
    renderColorBanner();
    engine.postMessage('ucinewgame');
    engine.postMessage('setoption name Skill Level value ' + strength);
    render();
    statusEl.textContent = 'Press Start Match to begin.';
    statusEl.className = 'status';
}

newGameBtn.addEventListener('click', resetGame);
document.getElementById('analysis-btn').addEventListener('click', () => {
    saveAnalysis();
    window.location.href = 'analysis.html';
});
document.getElementById('pro-analysis-btn').addEventListener('click', () => {
    saveAnalysis();
    window.location.href = 'pro-analysis.html';
});
sideSelect.addEventListener('change', resetGame);
strengthSelect.addEventListener('change', resetGame);
timeSelect.addEventListener('change', resetGame);

// ---- Start match ----
const startBtn = document.getElementById('start-btn');
startBtn.addEventListener('click', () => {
    if (gameOver) return;
    resetGame(); // always start from a fresh board, so White (move 1) is always first

    gameStarted = true;

    // The engine always plays the opposite side of the human.
    const engineColor = playerColor === 'w' ? 'b' : 'w';

    // White always moves first (chess rule). Switch the clock to whoever is to
    // move (at a fresh game that is White), then start ticking.
    onTurnChange();
    startClock();

    if (engineColor === 'w') {
        // Engine is White -> the engine makes the first move.
        statusEl.textContent = 'White (engine) moves first. The Undefeated is thinking...';
        statusEl.className = 'status';
        setTimeout(askEngineMove, 400);
    } else {
        // The human is White -> the human makes the first move.
        statusEl.textContent = 'White (you) moves first. Make your move.';
        statusEl.className = 'status';
    }
});

// ---- Forfeit / resign ----
const forfeitBtn = document.getElementById('forfeit');
forfeitBtn.addEventListener('click', () => {
    gameOver = true;
    thinking = false;
    stopClock();
    statusEl.textContent = 'You forfeited. The Undefeated wins.';
    statusEl.className = 'status win';
    selected = null;
    legalTargets = [];
    render();
    saveAnalysis();
});

// start
resetGame();
