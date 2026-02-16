# Online 2-Player Games

Play classic games with a friend — no sign-up, just a room code.

**[Play Now → anubhavdhakal.github.io/online-two-player-games](https://anubhavdhakal.github.io/online-two-player-games/)**

## How It Works

1. Pick a game
2. Click **Create Game** — share the 6-character room code (or invite link) with your friend
3. Your friend clicks **Join Game** and enters the code
4. Play!

Game state is synced in real-time through Firebase Realtime Database. Both players read and write to a shared room — no peer-to-peer connection required, so it works reliably across any network.

## Available Games

| Game | Status |
|------|--------|
| Tic-Tac-Toe | Live |
| Connect Four | Live |
| Battleship | Live |

## Tech Stack

- **Multiplayer:** Firebase Realtime Database
- **Frontend:** Vanilla HTML, CSS, JavaScript
- **Hosting:** GitHub Pages
- **Style:** Dark theme with neon accents

## Project Structure

```
├── index.html              # Landing page with game selection
├── css/style.css           # Global dark neon theme
├── js/
│   ├── firebase-config.js  # Firebase project configuration
│   └── connection.js       # Reusable Firebase connection manager
└── games/
    ├── tictactoe/
    │   ├── index.html      # Game page (lobby + board)
    │   ├── style.css       # Game-specific styles
    │   └── game.js         # Game logic
    ├── connectfour/
    │   ├── index.html
    │   ├── style.css
    │   └── game.js
    └── battleship/
        ├── index.html
        ├── style.css
        └── game.js
```

## Adding a New Game

1. Create a folder under `games/` with `index.html`, `style.css`, and `game.js`
2. Include the Firebase SDK, `firebase-config.js`, and `connection.js` scripts in your HTML
3. Use the `GameConnection` class from `js/connection.js` for multiplayer
4. Add a card to the landing page `index.html`
