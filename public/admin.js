/**
 * Mind Maze 2048 – Admin Panel Logic
 * Handles game control, timer, leaderboard, player management, and reset.
 */

(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);

  const startBtn     = $('start-btn');
  const endBtn       = $('end-btn');
  const setTimerBtn  = $('set-timer-btn');
  const timerInput   = $('timer-input');
  const resetBtn     = $('reset-btn');
  const statusEl     = $('game-status');
  const playerCount  = $('player-count');
  const scoreCount   = $('score-count');
  const gameDuration = $('game-duration');
  const remainingEl  = $('remaining-display');
  const leaderBody   = $('leaderboard-body');
  const playerList   = $('player-list');

  const loginOverlay = $('login-overlay');
  const adminContent = $('admin-content');
  const loginBtn     = $('login-btn');
  const passwordInp  = $('admin-password');
  const loginError   = $('login-error');
  const leaderboardModal = $('leaderboard-modal');
  const closeModal   = $('close-leaderboard-modal');
  const closeModalBtn = $('close-leaderboard-modal-btn');
  const viewLeaderboardBtn = $('view-leaderboard-btn');
  const fullLeaderboardBody = $('full-leaderboard-body');

  let adminPass = sessionStorage.getItem('adminPassword') || '';

  // ═══════════════════════════════════════════════════════════════════════════
  // AUTH LOGIC
  // ═══════════════════════════════════════════════════════════════════════════
  function showLogin() {
    loginOverlay.style.display = 'flex';
    adminContent.style.display = 'none';
  }

  function hideLogin() {
    loginOverlay.style.display = 'none';
    adminContent.style.display = 'block';
    refresh();
  }

  loginBtn.addEventListener('click', async () => {
    const pass = passwordInp.value;
    const data = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pass })
    }).then(r => r.json());

    if (data.success) {
      adminPass = pass;
      sessionStorage.setItem('adminPassword', pass);
      loginError.style.display = 'none';
      hideLogin();
      startPolling();
    } else {
      loginError.style.display = 'block';
    }
  });

  passwordInp.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') loginBtn.click();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // LEADERBOARD MODAL
  // ═══════════════════════════════════════════════════════════════════════════
  closeModal.addEventListener('click', () => {
    leaderboardModal.classList.add('hidden');
  });

  closeModalBtn.addEventListener('click', () => {
    leaderboardModal.classList.add('hidden');
  });

  viewLeaderboardBtn.addEventListener('click', async () => {
    leaderboardModal.classList.remove('hidden');
    // Show ALL players and their status (finished or waiting)
    const allPlayers = await api('/api/players');
    const playerArray = Array.isArray(allPlayers) ? allPlayers : [];
    
    if (playerArray.length === 0) {
      fullLeaderboardBody.innerHTML = '<tr><td colspan="4" style="color:var(--text-dim); text-align:center;">No players yet</td></tr>';
    } else {
      fullLeaderboardBody.innerHTML = playerArray.map((p, i) => {
        const rankClass = i < 3 && p.hasPlayed ? ` rank-${i + 1}` : '';
        const score = p.score || 0;
        const status = p.hasPlayed ? '✓ Finished' : '⏳ Waiting';
        const statusClass = p.hasPlayed ? 'played' : 'waiting';
        return `<tr>
          <td class="rank${rankClass}">${i + 1}</td>
          <td>${escapeHtml(p.username || 'Unknown')}</td>
          <td style="font-weight:700; color:var(--accent);">${score.toLocaleString()}</td>
          <td><span class="status-tag ${statusClass}">${status}</span></td>
        </tr>`;
      }).join('');
    }
  });

  leaderboardModal.addEventListener('click', (e) => {
    if (e.target === leaderboardModal) {
      leaderboardModal.classList.add('hidden');
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // API HELPERS
  // ═══════════════════════════════════════════════════════════════════════════
  async function api(path, opts = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (adminPass) headers['Authorization'] = adminPass;

    try {
      const res = await fetch(path, {
        ...opts,
        headers: { ...headers, ...(opts.headers || {}) },
      });

      if (res.status === 401 && path.includes('/api/admin/')) {
        adminPass = '';
        sessionStorage.removeItem('adminPassword');
        showLogin();
        return { error: 'Session expired' };
      }

      const data = await res.json();
      return data || {};
    } catch (err) {
      console.error('API Error:', err);
      return { error: 'Network error' };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GAME CONTROL
  // ═══════════════════════════════════════════════════════════════════════════
  startBtn.addEventListener('click', async () => {
    const data = await api('/api/admin/start', { method: 'POST' });
    if (data.error) alert(data.error);
    refresh();
  });

  endBtn.addEventListener('click', async () => {
    if (!confirm('End the game for all players?')) return;
    await api('/api/admin/end', { method: 'POST' });
    refresh();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // TIMER
  // ═══════════════════════════════════════════════════════════════════════════
  setTimerBtn.addEventListener('click', async () => {
    const t = parseInt(timerInput.value, 10);
    if (!t || t < 10 || t > 3600) { alert('Timer must be 10–3600 seconds.'); return; }
    const data = await api('/api/admin/timer', { method: 'POST', body: JSON.stringify({ timer: t }) });
    if (data.error) alert(data.error);
    refresh();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // RESET
  // ═══════════════════════════════════════════════════════════════════════════
  resetBtn.addEventListener('click', async () => {
    if (!confirm('⚠️ This will DELETE all players and reset everything. Continue?')) return;
    await api('/api/admin/reset', { method: 'POST' });
    refresh();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // POLLING – refresh every 3 seconds
  // ═══════════════════════════════════════════════════════════════════════════
  let pollInterval;
  async function refresh() {
    if (!adminPass) return;
    try {
      // Status
      const status = await api('/api/status');
      if (!status || status.error) {
        statusEl.className = 'status-indicator stopped';
        statusEl.innerHTML = '<span class="dot"></span> Error';
        remainingEl.textContent = '--:--';
        return;
      }
      if (status.started) {
        statusEl.className = 'status-indicator live';
        statusEl.innerHTML = '<span class="dot"></span> LIVE';
      } else {
        statusEl.className = 'status-indicator stopped';
        statusEl.innerHTML = '<span class="dot"></span> Stopped';
      }
      // Remaining
      const m = String(Math.floor((status.remaining || 0) / 60)).padStart(2, '0');
      const s = String((status.remaining || 0) % 60).padStart(2, '0');
      remainingEl.textContent = `${m}:${s}`;
      gameDuration.textContent = (status.timer || 120) + 's';
      timerInput.value = status.timer || 120;

      // Player count
      const countData = await api('/api/players/count');
      playerCount.textContent = (countData && countData.count) || 0;

      // Leaderboard – players who have played
      const leaders = await api('/api/leaderboard');
      const leaderArray = Array.isArray(leaders) ? leaders : [];
      scoreCount.textContent = leaderArray.length;
      if (leaderArray.length === 0) {
        leaderBody.innerHTML = '<tr><td colspan="3" style="color:var(--text-dim); text-align:center;">No players finished yet</td></tr>';
      } else {
        leaderBody.innerHTML = leaderArray.map((p, i) => {
          const rankClass = i < 3 ? ` rank-${i + 1}` : '';
          const score = p.score || 0;
          return `<tr>
            <td class="rank${rankClass}">${i + 1}</td>
            <td>${escapeHtml(p.username || 'Unknown')}</td>
            <td style="font-weight:700; color:var(--accent);">${score.toLocaleString()}</td>
          </tr>`;
        }).join('');
      }

      // Player list
      const players = await api('/api/players');
      const playerArray = Array.isArray(players) ? players : [];
      if (playerArray.length === 0) {
        playerList.innerHTML = '<p style="color:var(--text-dim);">No players yet</p>';
      } else {
        playerList.innerHTML = playerArray.map(p => `
          <div class="player-item">
            <div>
              <span class="name">${escapeHtml(p.username || 'Unknown')}</span>
              <span class="status-tag ${p.hasPlayed ? 'played' : 'waiting'}">${p.hasPlayed ? 'Played · ' + (p.score || 0).toLocaleString() : 'Waiting'}</span>
            </div>
            <button class="btn btn-danger btn-small" onclick="removePlayer(${p.id}, '${escapeHtml(p.username || 'Unknown')}')">✕</button>
          </div>
        `).join('');
      }
    } catch (err) {
      console.error('Refresh error:', err);
    }
  }

  function startPolling() {
    if (pollInterval) clearInterval(pollInterval);
    refresh();
    pollInterval = setInterval(refresh, 3000);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // REMOVE PLAYER
  // ═══════════════════════════════════════════════════════════════════════════
  window.removePlayer = async function (id, name) {
    if (!confirm(`Remove player "${name}"?`)) return;
    await api(`/api/admin/player/${id}`, { method: 'DELETE' });
    refresh();
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════════════════════
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ── Initial State ──────────────────────────────────────────────────────────
  if (adminPass) {
    hideLogin();
    startPolling();
  } else {
    showLogin();
  }

})();
