// Live player counter via Supabase.
// Requires config.js to be loaded first (window.CHESS_CONFIG).
// If not configured, the badge shows "--" instead of breaking the page.
(async () => {
    const cfg = window.CHESS_CONFIG || null;
    const badge = document.getElementById('online-count');
    const noop = () => {};

    if (!cfg || !cfg.SUPABASE_URL || cfg.SUPABASE_URL.includes('YOUR-PROJECT')) {
        if (badge) badge.textContent = '--';
        return;
    }

    let supabase;
    try {
        const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
        supabase = createClient(cfg.SUPABASE_URL, cfg.SUPABASE_KEY);
    } catch (e) {
        console.warn('Supabase failed to load', e);
        if (badge) badge.textContent = '--';
        return;
    }

    // Each visitor is a row. We touch it every 20s so the count stays accurate.
    // We use a fixed bucket for this device/tab; reusing it avoids duplicates on reload.
    const storeKey = 'chess_online_id';
    let playerId = localStorage.getItem(storeKey);
    if (!playerId) {
        playerId = crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random();
        localStorage.setItem(storeKey, playerId);
    }

    async function touch() {
        try {
            const table = 'players_online';
            const { error } = await supabase
                .from(table)
                .upsert({ id: playerId, last_seen: new Date().toISOString() }, { onConflict: 'id' });
            if (error) console.warn('supabase touch err', error.message);
        } catch (e) { /* offline or blocked - ignore */ }
    }

    async function refreshCount() {
        try {
            const { data, error } = await supabase
                .rpc('online_count');
            if (!error && typeof data === 'number' && badge) badge.textContent = data;
            else if (badge && !error) badge.textContent = String(data);
        } catch (e) { /* ignore */ }
    }

    // Heartbeat every 20s while page is open
    const heartbeat = setInterval(() => touch(), 20000);
    // Refresh the visible count every 10s
    const poller = setInterval(() => refreshCount(), 10000);

    // When the tab/window closes (or is hidden/closed entirely), the row will age out
    // because the count only includes rows seen within the last 60 seconds.
    window.addEventListener('pagehide', () => {
        clearInterval(heartbeat);
        clearInterval(poller);
    });
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
            clearInterval(heartbeat);
            clearInterval(poller);
        } else {
            touch();
            refreshCount();
        }
    });

    touch();
    refreshCount();
})();