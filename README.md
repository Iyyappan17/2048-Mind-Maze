# Mind Maze 2048 – College Event Game

A real-time multiplayer 2048 puzzle game built for college events. Features event mode with admin controls, leaderboard tracking, and practice mode.

## Features

- 🎮 **Event Mode**: Real-time multiplayer gameplay with admin controls
- 🏆 **Leaderboard**: Live scoring and ranking system
- 🎯 **Practice Mode**: Solo gameplay anytime
- ⏱️ **Timer Control**: Admin-configurable event duration
- 🔐 **Admin Panel**: Full event management console
- 🎵 **Sound Effects**: Web Audio API-based feedback

## Tech Stack

- **Backend**: Node.js + Express.js
- **Database**: sql.js (SQLite in-memory with persistence)
- **Frontend**: Vanilla JavaScript + CSS3
- **Deployment**: Railway, Vercel

## Installation

### Local Development

```bash
# Install dependencies
npm install

# Start server (runs on http://localhost:3000)
npm start
```

### Environment Variables

For Railway deployment, no environment variables are required for basic functionality. Optional:

- `PORT` - Server port (default: 3000)
- `DB_PATH` - Database file path (default: ./database.sqlite)

## Deployment

### Railway

1. **Connect Repository**:
   - Create a new Railway project
   - Connect your GitHub repository

2. **Configure**:
   - Railway auto-detects Node.js via `package.json`
   - Uses `npm start` as start command
   - Database file is stored in `/tmp` (ephemeral)

3. **Deploy**:
   - Push to GitHub
   - Railway auto-deploys on git push

### Vercel (Alternative)

```bash
npm i -g vercel
vercel
```

Vercel config is in `vercel.json`.

## API Routes

### Player Routes

- `POST /api/join` - Register player
- `GET /api/status` - Get game status
- `POST /api/move` - Submit move
- `GET /api/leaderboard` - Get top 20 scores
- `GET /api/players/count` - Get total players

### Admin Routes (require password)

- `POST /api/admin/start` - Start event
- `POST /api/admin/end` - End event
- `POST /api/admin/timer` - Set timer duration
- `POST /api/admin/reset` - Reset all data
- `DELETE /api/admin/player/:id` - Remove player

Admin password: `admin@2026` (set in `server.js`)

## Project Structure

```
.
├── server.js              # Express server & API
├── public/
│   ├── index.html         # Landing page
│   ├── player.html        # Player game interface
│   ├── admin.html         # Admin control panel
│   ├── game.js            # Game engine
│   ├── admin.js           # Admin logic
│   ├── style.css          # Styling
│   └── game.js            # Game mechanics
├── package.json           # Dependencies
├── database.sqlite        # SQLite database (generated)
├── vercel.json            # Vercel config
├── railway.json           # Railway config
├── Procfile               # Process file for platforms
└── README.md              # This file
```

## Development Notes

- Game board is 4×4 tiles
- Tiles spawn with values 2 or 4
- Score increases when tiles merge
- Event timer is configurable by admin (10-3600 seconds)
- Database auto-persists to file

## License

College Event Management System © 2026
