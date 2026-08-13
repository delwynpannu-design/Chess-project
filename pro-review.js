// PRO button on the game page -> save the game and open the dedicated PRO review page.
(() => {
    const btn = document.getElementById('advanced-btn');
    if (!btn) return;

    const cfg = window.CHESS_CONFIG || {};
    const isOwner = Boolean(cfg.OWNER) ||
        localStorage.getItem('chess_pro') === '1' ||
        ['localhost', '127.0.0.1'].includes(location.hostname);

    btn.addEventListener('click', () => {
        if (!isOwner) {
            alert('Advanced Game Analysis is a PRO feature for paid players.');
            return;
        }
        const game = window.__chessGame;
        if (game) {
            try {
                localStorage.setItem('chess_analysis', JSON.stringify({
                    moves: game.history(),
                    status: (document.getElementById('status') || {}).textContent || ''
                }));
            } catch (e) { /* ignore */ }
        }
        window.location.href = 'pro-analysis.html';
    });
})();