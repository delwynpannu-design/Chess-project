// Normal (free) Game Analysis - replay your finished game move by move.
import { Chess } from './vendor/chess.js';

(async () => {
    const PIECE_CHARS = {
        w: { k: '\u2654', q: '\u2655', r: '\u2656', b: '\u2657', n: '\u2658', p: '\u2659' },
        b: { k: '\u265A', q: '\u265B', r: '\u265C', b: '\u265D', n: '\u265E', p: '\u265F' },
    };

    const boardEl = document.getElementById('board');
    const statusEl = document.getElementById('status');
    const movesEl = document.getElementById('moves');
    const counterEl = document.getElementById('move-counter');

    const game = new Chess();
    const moves = [];

    let currentIndex = 0;

    function toAlgebraic(row, col) {
        return String.fromCharCode(97 + col) + (8 - row);
    }

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

                const piece = squares[row][col];
                if (piece) {
                    const span = document.createElement('span');
                    span.className = 'piece';
                    span.textContent = PIECE_CHARS[piece.color][piece.type];
                    span.style.lineHeight = '1';
                    span.style.pointerEvents = 'none';
                    if (piece.color === 'w') {
                        span.style.color = '#ffffff';
                        span.style.webkitTextStroke = '1.5px #20242c';
                    } else {
                        span.style.color = '#16181d';
                        span.style.webkitTextStroke = '1px #d9dee6';
                    }
                    square.appendChild(span);
                }
                grid.appendChild(square);
            }
        }

        boardEl.appendChild(grid);
        renderMoves();
    }

    function renderMoves() {
        movesEl.innerHTML = '';
        for (let i = 0; i < moves.length; i += 2) {
            const pair = document.createElement('div');
            pair.className = 'move-pair';
            const num = document.createElement('span');
            num.className = 'num';
            num.textContent = (Math.floor(i / 2) + 1) + '.';
            pair.appendChild(num);
            for (let j = i; j < Math.min(i + 2, moves.length); j++) {
                const span = document.createElement('span');
                span.className = 'move-link';
                if (j === currentIndex - 1) span.classList.add('active');
                span.textContent = moves[j].san;
                span.addEventListener('click', () => goTo(j + 1));
                pair.appendChild(span);
            }
            movesEl.appendChild(pair);
        }
        if (counterEl) counterEl.textContent = 'Move ' + currentIndex + ' / ' + moves.length;
    }

    function goTo(index) {
        index = Math.max(0, Math.min(moves.length, index));
        game.reset();
        for (let i = 0; i < index; i++) game.move(moves[i].san);
        currentIndex = index;
        render();
    }

    // ---- navigation ----
    document.getElementById('to-start').addEventListener('click', () => goTo(0));
    document.getElementById('prev').addEventListener('click', () => goTo(currentIndex - 1));
    document.getElementById('next').addEventListener('click', () => goTo(currentIndex + 1));
    document.getElementById('to-end').addEventListener('click', () => goTo(moves.length));

    document.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowRight') goTo(currentIndex + 1);
        if (e.key === 'ArrowLeft') goTo(currentIndex - 1);
    });

    // ---- load saved game ----
    let saved = null;
    try {
        saved = JSON.parse(localStorage.getItem('chess_analysis') || 'null');
    } catch (e) { saved = null; }

    if (!saved || !Array.isArray(saved.moves) || !saved.moves.length) {
        statusEl.textContent = 'No saved game yet. Play a game on the home page first, then open Game Analysis.';
        statusEl.className = 'status';
        render();
        return;
    }

    const engine = new Chess();
    for (const san of saved.moves) {
        try {
            const mv = engine.move(san);
            moves.push(mv);
        } catch (e) { /* stop replaying on an invalid move */ }
    }

    statusEl.textContent = saved.status ? saved.status : 'Use the controls to step through your game.';
    statusEl.className = 'status';
    goTo(moves.length);
})();