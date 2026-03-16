/**
 * Mind Maze 2048 – Server
 * Express + sql.js (pure JS SQLite) backend for the college event game.
 */

const express = require('express');
const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
// For deployment platforms like Railway, set DB_PATH to a writable directory (e.g. /tmp) via env var.
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'database.sqlite');

// ── Middleware ──────────────────────────────────────────────────────────────────
app.use(express.json());

// Ensure root always serves index.html (helps with some deploy routing setups)
app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Legacy/alternate routes that should resolve to the player page
app.get(['/game.html', '/game'], (_req, res) => {
  res.redirect('/player.html');
});

app.use(express.static(path.join(__dirname, 'public'))); // serve frontend files from /public

const ADMIN_PASSWORD = 'admin@2026';

// ── Auth Middleware ─────────────────────────────────────────────────────────────
function adminAuth(req, res, next) {
  const auth = req.headers['authorization'];
  if (auth === ADMIN_PASSWORD) {
    next();
  } else {
    res.status(401).json({ error: 'Unauthorized. Admin access required.' });
  }
}

let db; // SQLite database instance
let isDbInitialized = false;
let dbInitPromise = null;

function ensureDb() {
  if (isDbInitialized) return Promise.resolve();
  if (!dbInitPromise) {
    dbInitPromise = initDB().then(() => {
      isDbInitialized = true;
    });
  }
  return dbInitPromise;
}

// ── Database Setup ─────────────────────────────────────────────────────────────
async function initDB() {
  const SQL = await initSqlJs();

  // Ensure a writable database path exists in runtime environments (e.g. Railway /tmp)
  const repoDbPath = path.join(__dirname, 'database.sqlite');
  if (DB_PATH !== repoDbPath && !fs.existsSync(DB_PATH) && fs.existsSync(repoDbPath)) {
    fs.copyFileSync(repoDbPath, DB_PATH);
  }

  // Load existing DB file or create new
  let fileBuffer;
  if (fs.existsSync(DB_PATH)) {
    fileBuffer = fs.readFileSync(DB_PATH);
  } else if (fs.existsSync(repoDbPath)) {
    fileBuffer = fs.readFileSync(repoDbPath);
  }

  if (fileBuffer) {
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  // Create tables if they don't exist
  db.run(`
    CREATE TABLE IF NOT EXISTS players (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      username  TEXT    UNIQUE NOT NULL,
      score     INTEGER DEFAULT 0,
      hasPlayed INTEGER DEFAULT 0
    );
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS game_state (
      id              INTEGER PRIMARY KEY CHECK (id = 1),
      started         INTEGER DEFAULT 0,
      timer           INTEGER DEFAULT 120,
      start_time      INTEGER DEFAULT 0,
      timer_duration  INTEGER DEFAULT 120
    );
  `);

  // Add timer_duration column if it doesn't exist (migration for existing databases)
  try {
    db.run('SELECT timer_duration FROM game_state LIMIT 1');
  } catch {
    try {
      db.run('ALTER TABLE game_state ADD COLUMN timer_duration INTEGER DEFAULT 120');
    } catch {}
  }

  // Ensure the single game_state row exists
  const rows = db.exec('SELECT id FROM game_state WHERE id = 1');
  if (rows.length === 0 || rows[0].values.length === 0) {
    db.run('INSERT INTO game_state (id, started, timer, start_time, timer_duration) VALUES (1, 0, 120, 0, 120)');
  }

  saveDB();
  console.log('  📦 Database initialized.');
}

// Persist DB to disk
function saveDB() {
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
}

// Helper: run query and return rows as objects
function queryAll(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

function queryOne(sql, params = []) {
  const rows = queryAll(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

function runSQL(sql, params = []) {
  db.run(sql, params);
  saveDB();
}

// ── Helper: compute remaining seconds ──────────────────────────────────────────
function getState() {
  return queryOne('SELECT * FROM game_state WHERE id = 1');
}

function getRemainingTime(state) {
  if (!state.started) {
    // If game hasn't started yet, return the full timer
    // But if the elapsed time since start_time is significant, game has ended
    if (state.start_time === 0) return state.timer;
    // Game has ended - check if we're past the duration
    const elapsed = Math.floor((Date.now() - state.start_time) / 1000);
    const duration = state.timer_duration || state.timer;
    if (elapsed >= duration) return 0; // Game ended
    return duration - elapsed;
  }
  const elapsed = Math.floor((Date.now() - state.start_time) / 1000);
  const duration = state.timer_duration || state.timer; // Use duration set at game start
  return Math.max(0, duration - elapsed);
}

// ═══════════════════════════════════════════════════════════════════════════════
//   PLAYER ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

app.use('/api', async (req, res, next) => {
  try {
    await ensureDb();
    next();
  } catch (err) {
    console.error('DB Init Error:', err);
    res.status(500).json({ error: 'Database initialization failed.' });
  }
});

/** POST /api/join – register a new player */
app.post('/api/join', (req, res) => {
  const { username } = req.body;
  if (username === null || username === undefined || typeof username !== 'string' || username.trim().length === 0) {
    return res.status(400).json({ error: 'Username is required.' });
  }
  const clean = username.trim().substring(0, 30);

  // Check for duplicate
  const existing = queryOne('SELECT id FROM players WHERE username = ?', [clean]);
  if (existing) {
    return res.status(409).json({ error: 'Username already taken.' });
  }

  try {
    runSQL('INSERT INTO players (username) VALUES (?)', [clean]);
    const player = queryOne('SELECT id FROM players WHERE username = ?', [clean]);
    return res.json({ success: true, playerId: player.id, username: clean });
  } catch (err) {
    return res.status(500).json({ error: 'Server error.' });
  }
});

/** GET /api/status – current game state for players */
app.get('/api/status', (_req, res) => {
  const state = getState();
  if (!state) {
    return res.status(500).json({ error: 'Game state not initialized.' });
  }
  const remaining = getRemainingTime(state);

  // Auto-end if timer has run out
  if (state.started && remaining <= 0) {
    runSQL('UPDATE game_state SET started = 0 WHERE id = 1');
    return res.json({ started: false, timer: state.timer, remaining: 0, ended: true });
  }

  res.json({
    started:   !!state.started,
    timer:     state.timer,
    remaining,
    ended:     false,
  });
});

/** POST /api/score – submit score after game */
app.post('/api/score', (req, res) => {
  const { playerId, score } = req.body;
  if (playerId == null || score == null) {
    return res.status(400).json({ error: 'playerId and score are required.' });
  }

  const player = queryOne('SELECT * FROM players WHERE id = ?', [playerId]);
  if (!player) return res.status(404).json({ error: 'Player not found.' });
  if (player.hasPlayed) return res.status(403).json({ error: 'You have already played.' });

  const state = getState();
  if (!state) {
    return res.status(500).json({ error: 'Game state not initialized.' });
  }
  const remaining = getRemainingTime(state);

  // Allow submission if game is started, or just ended (remaining 0)
  if (!state.started && remaining > 0) {
    return res.status(403).json({ error: 'Event has not started.' });
  }

  const safeScore = Math.max(0, Math.floor(Number(score)));
  runSQL('UPDATE players SET score = ?, hasPlayed = 1 WHERE id = ?', [safeScore, playerId]);
  res.json({ success: true, score: safeScore });
});

// ═══════════════════════════════════════════════════════════════════════════════
//   ADMIN ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

/** POST /api/admin/login – validate admin password */
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) {
    res.json({ success: true });
  } else {
    res.status(401).json({ error: 'Incorrect password.' });
  }
});

/** GET /api/admin/game-status – check if game is over */
app.get('/api/admin/game-status', adminAuth, (_req, res) => {
  const state = getState();
  if (!state) {
    return res.status(500).json({ error: 'Game state not initialized.' });
  }
  res.json({
    started: !!state.started,
    isGameOver: !state.started,
    remaining: getRemainingTime(state)
  });
});

/** POST /api/admin/start – start the event */
app.post('/api/admin/start', adminAuth, (_req, res) => {
  const state = getState();
  if (!state) {
    return res.status(500).json({ error: 'Game state not initialized.' });
  }
  if (state.started) return res.status(400).json({ error: 'Game already started.' });
  // Capture the timer duration at start time so it won't change if admin adjusts timer later
  runSQL('UPDATE game_state SET started = 1, start_time = ?, timer_duration = ? WHERE id = 1', [Date.now(), state.timer]);
  res.json({ success: true });
});

/** POST /api/admin/end – end the event immediately */
app.post('/api/admin/end', adminAuth, (_req, res) => {
  runSQL('UPDATE game_state SET started = 0, start_time = 0 WHERE id = 1');
  res.json({ success: true });
});

/** POST /api/admin/timer – set the event timer duration */
app.post('/api/admin/timer', adminAuth, (req, res) => {
  const { timer } = req.body;
  const t = parseInt(timer, 10);
  if (!t || t < 10 || t > 3600) {
    return res.status(400).json({ error: 'Timer must be between 10 and 3600 seconds.' });
  }
  runSQL('UPDATE game_state SET timer = ? WHERE id = 1', [t]);
  res.json({ success: true, timer: t });
});

/** GET /api/leaderboard – all players who played, ordered by score (admin view) */
app.get('/api/leaderboard', (_req, res) => {
  const rows = queryAll('SELECT * FROM players WHERE hasPlayed = 1 ORDER BY score DESC, username ASC');
  res.json(rows);
});

/** GET /api/leaderboard/finished – only players who finished the game */
app.get('/api/leaderboard/finished', (_req, res) => {
  const rows = queryAll('SELECT * FROM players WHERE hasPlayed = 1 ORDER BY score DESC, username ASC');
  res.json(rows);
});

/** GET /api/players/count – total registered players */
app.get('/api/players/count', (_req, res) => {
  const row = queryOne('SELECT COUNT(*) AS count FROM players');
  res.json({ count: row.count });
});

/** GET /api/players – all players list (admin) */
app.get('/api/players', (_req, res) => {
  const rows = queryAll('SELECT * FROM players ORDER BY score DESC');
  res.json(rows);
});

/** DELETE /api/admin/player/:id – remove a player */
app.delete('/api/admin/player/:id', adminAuth, (req, res) => {
  const id = parseInt(req.params.id, 10);
  runSQL('DELETE FROM players WHERE id = ?', [id]);
  res.json({ success: true });
});

/** POST /api/admin/reset – reset entire event */
app.post('/api/admin/reset', adminAuth, (_req, res) => {
  runSQL('DELETE FROM players');
  runSQL('UPDATE game_state SET started = 0, timer = 120, start_time = 0, timer_duration = 120 WHERE id = 1');
  res.json({ success: true });
});

// ── Start Server ───────────────────────────────────────────────────────────────
if (process.env.VERCEL) {
  module.exports = app;
} else {
  ensureDb().then(() => {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`\n  🎮  Mind Maze 2048 is running at http://localhost:${PORT}\n`);
    });
  }).catch(err => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
}
