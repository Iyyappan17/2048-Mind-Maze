/**
 * Mind Maze 2048 – Game Engine + Player Logic
 * Complete 2048 engine with practice/event modes, swipe support, sound FX, timer.
 */

(() => {
  'use strict';

  // ═══════════════════════════════════════════════════════════════════════════
  // STATE
  // ═══════════════════════════════════════════════════════════════════════════
  const SIZE = 4;
  let grid = [];          // 4×4 array of { value, id }
  let score = 0;
  let bestScore = 0;
  let tileIdCounter = 0;
  let gameActive = false;
  let isPractice = false;
  let isEvent = false;
  let playerId = null;
  let playerUsername = '';
  let hasSubmitted = false;
  let statusPollId = null;
  let timerPollId = null;

  // ═══════════════════════════════════════════════════════════════════════════
  // DOM ELEMENTS
  // ═══════════════════════════════════════════════════════════════════════════
  const $ = (id) => document.getElementById(id);
  const screens = {
    join:     $('join-screen'),
    waiting:  $('waiting-screen'),
    game:     $('game-screen'),
    gameover: $('gameover-screen'),
  };
  const joinBtn       = $('join-btn');
  const usernameInput = $('username-input');
  const joinError     = $('join-error');
  const practiceBtn   = $('practice-btn');
  const restartBtn    = $('restart-practice-btn');
  const backBtn       = $('back-btn');
  const tileLayer     = $('tile-layer');
  const scoreEl       = $('current-score');
  const bestEl        = $('best-score');
  const timerDisplay  = $('timer-display');
  const modeBadge     = $('mode-badge');
  const practiceCtrl  = $('practice-controls');
  const finalScoreEl  = $('final-score');
  const waitingBanner = $('waiting-banner');

  function showScreen(name) {
    Object.values(screens).forEach(s => s.classList.add('hidden'));
    screens[name].classList.remove('hidden');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SOUND FX – Web Audio API oscillator tones (no external files needed)
  // ═══════════════════════════════════════════════════════════════════════════
  let audioCtx = null;
  function ensureAudio() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  function playTone(freq, dur, type = 'sine', vol = 0.12) {
    try {
      ensureAudio();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(vol, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + dur);
    } catch (_) {}
  }
  const sfx = {
    move:    () => playTone(220, 0.08, 'triangle', 0.08),
    merge:   () => playTone(440, 0.15, 'sine', 0.15),
    spawn:   () => playTone(660, 0.06, 'sine', 0.06),
    gameOver:() => { playTone(200, 0.3, 'sawtooth', 0.1); setTimeout(() => playTone(150, 0.4, 'sawtooth', 0.1), 300); },
    warning: () => playTone(800, 0.1, 'square', 0.08),
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // JOIN FLOW
  // ═══════════════════════════════════════════════════════════════════════════
  joinBtn.addEventListener('click', joinGame);
  usernameInput.addEventListener('keydown', e => { if (e.key === 'Enter') joinGame(); });

  async function joinGame() {
    const name = usernameInput.value.trim();
    if (!name) { joinError.textContent = 'Please enter a username.'; return; }
    joinBtn.disabled = true;
    joinError.textContent = '';
    try {
      const res = await fetch('/api/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: name }),
      });
      const data = await res.json();
      if (!res.ok) { joinError.textContent = data.error; joinBtn.disabled = false; return; }
      playerId = data.playerId;
      playerUsername = data.username;
      showScreen('waiting');
      startStatusPolling();
    } catch {
      joinError.textContent = 'Connection error. Please try again.';
      joinBtn.disabled = false;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STATUS POLLING – check if event started
  // ═══════════════════════════════════════════════════════════════════════════
  function startStatusPolling() {
    checkStatus();
    statusPollId = setInterval(checkStatus, 1500);
  }
  function stopStatusPolling() {
    clearInterval(statusPollId);
    statusPollId = null;
  }
  async function checkStatus() {
    try {
      const res = await fetch('/api/status');
      const data = await res.json();
      if (data.started && !isEvent && !hasSubmitted) {
        // Event just started — launch event game
        stopStatusPolling();
        startEventGame(data.remaining);
      }
    } catch {}
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRACTICE MODE
  // ═══════════════════════════════════════════════════════════════════════════
  practiceBtn.addEventListener('click', () => {
    isPractice = true;
    isEvent = false;
    modeBadge.textContent = 'Practice Mode';
    modeBadge.className = 'practice-badge';
    timerDisplay.classList.add('hidden');
    practiceCtrl.classList.remove('hidden');
    showScreen('game');
    initGame();
  });
  restartBtn.addEventListener('click', () => {
    if (isPractice) initGame();
  });
  backBtn.addEventListener('click', () => {
    gameActive = false;
    isPractice = false;
    showScreen('waiting');
    startStatusPolling();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // EVENT MODE
  // ═══════════════════════════════════════════════════════════════════════════
  function startEventGame(remaining) {
    isPractice = false;
    isEvent = true;
    modeBadge.textContent = '🔴 LIVE EVENT';
    modeBadge.className = 'event-badge';
    timerDisplay.classList.remove('hidden');
    practiceCtrl.classList.add('hidden');
    showScreen('game');
    initGame();
    startTimer(remaining);
  }

  // ── Timer ──────────────────────────────────────────────────────────────────
  let remainingTime = 0;
  function startTimer(seconds) {
    remainingTime = seconds;
    updateTimerDisplay();
    timerPollId = setInterval(async () => {
      try {
        const res = await fetch('/api/status');
        const data = await res.json();
        if (!data.started || data.ended) {
          clearInterval(timerPollId);
          endEventGame();
          return;
        }
        remainingTime = data.remaining;
        updateTimerDisplay();
        if (remainingTime <= 10 && remainingTime > 0) {
          document.body.classList.add('red-flash');
          timerDisplay.classList.add('warning');
          sfx.warning();
        }
        if (remainingTime <= 0) {
          clearInterval(timerPollId);
          endEventGame();
        }
      } catch {}
    }, 1000);
  }
  function updateTimerDisplay() {
    const m = String(Math.floor(remainingTime / 60)).padStart(2, '0');
    const s = String(remainingTime % 60).padStart(2, '0');
    timerDisplay.textContent = `⏱ ${m}:${s}`;
  }

  async function endEventGame() {
    gameActive = false;
    isEvent = false;
    document.body.classList.remove('red-flash');
    timerDisplay.classList.remove('warning');
    clearInterval(timerPollId);

    if (!hasSubmitted) {
      hasSubmitted = true;
      try {
        await fetch('/api/score', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ playerId, score }),
        });
      } catch {}
    }
    sfx.gameOver();
    finalScoreEl.textContent = score;
    showScreen('gameover');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 2048 ENGINE
  // ═══════════════════════════════════════════════════════════════════════════
  function initGame() {
    grid = Array.from({ length: SIZE }, () => Array.from({ length: SIZE }, () => null));
    score = 0;
    gameActive = true;
    updateScoreUI();
    addRandomTile();
    addRandomTile();
    renderTiles();
  }

  function addRandomTile() {
    const empty = [];
    for (let r = 0; r < SIZE; r++)
      for (let c = 0; c < SIZE; c++)
        if (!grid[r][c]) empty.push({ r, c });
    if (empty.length === 0) return;
    const { r, c } = empty[Math.floor(Math.random() * empty.length)];
    grid[r][c] = { value: Math.random() < 0.9 ? 2 : 4, id: ++tileIdCounter, isNew: true, merged: false };
    sfx.spawn();
  }

  function updateScoreUI() {
    scoreEl.textContent = score;
    if (score > bestScore) { bestScore = score; bestEl.textContent = bestScore; }
  }

  // ── Tile Rendering ─────────────────────────────────────────────────────────
  function renderTiles() {
    tileLayer.innerHTML = '';
    const gap = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--grid-gap')) || 10;
    const cellSize = tileLayer.parentElement.querySelector('.grid-cell').offsetWidth;
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const cell = grid[r][c];
        if (!cell) continue;
        const tile = document.createElement('div');
        tile.className = 'tile';
        if (cell.isNew) tile.classList.add('new-tile');
        if (cell.merged) tile.classList.add('merged-tile');
        tile.dataset.value = cell.value;
        tile.textContent = cell.value;
        tile.style.left = `${c * (cellSize + gap)}px`;
        tile.style.top  = `${r * (cellSize + gap)}px`;
        tileLayer.appendChild(tile);
        // Clear animation flags after one frame
        cell.isNew = false;
        cell.merged = false;
      }
    }
  }

  // ── Slide & Merge Logic ────────────────────────────────────────────────────
  function slide(row) {
    // Remove empty cells
    let tiles = row.filter(t => t !== null);
    const merged = [];
    for (let i = 0; i < tiles.length; i++) {
      if (i + 1 < tiles.length && tiles[i].value === tiles[i + 1].value) {
        const newVal = tiles[i].value * 2;
        merged.push({ value: newVal, id: ++tileIdCounter, isNew: false, merged: true });
        score += newVal;
        i++; // skip next
        sfx.merge();
      } else {
        merged.push({ ...tiles[i], isNew: false, merged: false });
      }
    }
    while (merged.length < SIZE) merged.push(null);
    return merged;
  }

  function move(direction) {
    if (!gameActive) return;
    let moved = false;

    // Build rows/columns based on direction, slide, then place back
    if (direction === 'left' || direction === 'right') {
      for (let r = 0; r < SIZE; r++) {
        let row = grid[r].slice();
        if (direction === 'right') row.reverse();
        const before = JSON.stringify(row);
        row = slide(row);
        if (direction === 'right') row.reverse();
        if (JSON.stringify(row) !== before) moved = true;
        grid[r] = row;
      }
    } else {
      for (let c = 0; c < SIZE; c++) {
        let col = [];
        for (let r = 0; r < SIZE; r++) col.push(grid[r][c]);
        if (direction === 'down') col.reverse();
        const before = JSON.stringify(col);
        col = slide(col);
        if (direction === 'down') col.reverse();
        if (JSON.stringify(col) !== before) moved = true;
        for (let r = 0; r < SIZE; r++) grid[r][c] = col[r];
      }
    }

    if (moved) {
      sfx.move();
      addRandomTile();
      updateScoreUI();
      renderTiles();
      if (isGameOver()) handleGameOver();
    }
  }

  function isGameOver() {
    for (let r = 0; r < SIZE; r++)
      for (let c = 0; c < SIZE; c++) {
        if (!grid[r][c]) return false;
        const v = grid[r][c].value;
        if (c + 1 < SIZE && grid[r][c + 1] && grid[r][c + 1].value === v) return false;
        if (r + 1 < SIZE && grid[r + 1][c] && grid[r + 1][c].value === v) return false;
      }
    return true;
  }

  function handleGameOver() {
    gameActive = false;
    if (isEvent) {
      endEventGame();
    } else {
      sfx.gameOver();
      // In practice, just show a brief overlay effect, then let them restart
      setTimeout(() => {
        alert('Game Over! Score: ' + score);
      }, 200);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // INPUT HANDLING
  // ═══════════════════════════════════════════════════════════════════════════

  // ── Keyboard ───────────────────────────────────────────────────────────────
  document.addEventListener('keydown', (e) => {
    const map = {
      ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down',
      a: 'left', d: 'right', w: 'up', s: 'down',
    };
    if (map[e.key]) { e.preventDefault(); move(map[e.key]); }
  });

  // ── Touch / Swipe ─────────────────────────────────────────────────────────
  let touchStartX = 0, touchStartY = 0;
  const gridEl = $('grid');

  gridEl.addEventListener('touchstart', (e) => {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
  }, { passive: true });

  gridEl.addEventListener('touchend', (e) => {
    const dx = e.changedTouches[0].clientX - touchStartX;
    const dy = e.changedTouches[0].clientY - touchStartY;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);
    const threshold = 30;
    if (Math.max(absDx, absDy) < threshold) return;
    if (absDx > absDy) {
      move(dx > 0 ? 'right' : 'left');
    } else {
      move(dy > 0 ? 'down' : 'up');
    }
  }, { passive: true });

  // Prevent scroll while playing
  document.addEventListener('touchmove', (e) => {
    if (gameActive) e.preventDefault();
  }, { passive: false });

})();
