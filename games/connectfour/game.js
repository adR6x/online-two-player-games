/* ===== Connect Four Game Logic ===== */

let gc = new GameConnection('connectfour');

// --- Constants ---
const ROWS = 6;
const COLS = 7;

// --- State ---
let board = [];                    // board[row][col] = null | 'R' | 'Y'
let myColor = null;                // 'R' for host, 'Y' for guest
let isMyTurn = false;
let gameActive = false;
let scores = { R: 0, Y: 0, draws: 0 };

// --- DOM refs ---
const $lobby        = document.getElementById('lobby');
const $gameArea     = document.getElementById('game-area');
const $createBtn    = document.getElementById('create-btn');
const $joinBtn      = document.getElementById('join-btn');
const $codeInput    = document.getElementById('code-input');
const $roomDisplay  = document.getElementById('room-display');
const $roomCode     = document.getElementById('room-code');
const $copyBtn      = document.getElementById('copy-btn');
const $copyLinkBtn  = document.getElementById('copy-link-btn');
const $waitingText  = document.getElementById('waiting-text');
const $connStatus   = document.getElementById('conn-status');
const $board        = document.getElementById('board');
const $previewRow   = document.getElementById('preview-row');
const $turnText     = document.getElementById('turn-text');
const $scoreText    = document.getElementById('score-text');
const $overlay      = document.getElementById('overlay');
const $resultTitle  = document.getElementById('result-title');
const $resultMsg    = document.getElementById('result-msg');
const $playAgainBtn = document.getElementById('play-again-btn');
const $backMenuBtn  = document.getElementById('back-menu-btn');
const cells         = document.querySelectorAll('.cell');
const previewCells  = document.querySelectorAll('.preview-cell');

// =====================
//  Connection Callbacks
// =====================

function wireCallbacks(conn) {
  conn.onConnected = () => {
    $connStatus.textContent = 'Connected!';
    $connStatus.className = 'connection-status connected';
    $lobby.classList.add('hidden');
    $gameArea.classList.remove('hidden');
    startNewRound();
  };

  conn.onData = (data) => {
    switch (data.type) {
      case 'move':
        dropDisc(data.column, data.color, true);
        break;
      case 'play-again':
        startNewRound();
        break;
    }
  };

  conn.onDisconnected = () => {
    returnToLobby('Opponent has left the game');
  };

  conn.onError = (err) => {
    $connStatus.textContent = 'Connection error: ' + (err.type || err.message || err);
    $connStatus.className = 'connection-status error';
  };
}

function returnToLobby(message) {
  gameActive = false;
  gc.destroy();
  gc = new GameConnection('connectfour');
  wireCallbacks(gc);

  // Reset game state
  board = [];
  myColor = null;
  scores = { R: 0, Y: 0, draws: 0 };

  // Reset UI back to lobby
  $gameArea.classList.add('hidden');
  $overlay.classList.add('hidden');
  $lobby.classList.remove('hidden');
  $roomDisplay.classList.add('hidden');
  $waitingText.classList.add('hidden');
  $createBtn.disabled = false;
  $joinBtn.disabled = false;
  $codeInput.disabled = false;
  $codeInput.value = '';

  clearPreview();

  $connStatus.textContent = message;
  $connStatus.className = 'connection-status error';
}

wireCallbacks(gc);

// =====================
//  Lobby Actions
// =====================

$createBtn.addEventListener('click', async () => {
  $createBtn.disabled = true;
  $joinBtn.disabled = true;
  $codeInput.disabled = true;
  $connStatus.textContent = 'Creating game...';
  $connStatus.className = 'connection-status';

  try {
    const code = await gc.createGame();
    myColor = 'R';
    $roomDisplay.classList.remove('hidden');
    $roomCode.textContent = code;
    $waitingText.classList.remove('hidden');
    $connStatus.textContent = 'Waiting for opponent...';
  } catch {
    $connStatus.textContent = 'Failed to create game. Try again.';
    $connStatus.className = 'connection-status error';
    $createBtn.disabled = false;
    $joinBtn.disabled = false;
    $codeInput.disabled = false;
  }
});

$joinBtn.addEventListener('click', async () => {
  const code = $codeInput.value.trim();
  if (code.length < 4) {
    $connStatus.textContent = 'Enter a valid room code';
    $connStatus.className = 'connection-status error';
    return;
  }

  $createBtn.disabled = true;
  $joinBtn.disabled = true;
  $codeInput.disabled = true;
  $connStatus.textContent = 'Joining...';
  $connStatus.className = 'connection-status';

  try {
    myColor = 'Y';
    await gc.joinGame(code);
  } catch {
    $connStatus.textContent = 'Could not join. Check the code and try again.';
    $connStatus.className = 'connection-status error';
    $createBtn.disabled = false;
    $joinBtn.disabled = false;
    $codeInput.disabled = false;
  }
});

$codeInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') $joinBtn.click();
});

function getShareLink(code) {
  const url = new URL(window.location.href.split('?')[0]);
  url.searchParams.set('code', code);
  return url.toString();
}

$copyLinkBtn.addEventListener('click', () => {
  navigator.clipboard.writeText(getShareLink($roomCode.textContent)).then(() => {
    $copyLinkBtn.textContent = 'Copied!';
    setTimeout(() => { $copyLinkBtn.textContent = 'Copy Link'; }, 1500);
  });
});

$copyBtn.addEventListener('click', () => {
  navigator.clipboard.writeText($roomCode.textContent).then(() => {
    $copyBtn.textContent = 'Copied!';
    setTimeout(() => { $copyBtn.textContent = 'Copy Code'; }, 1500);
  });
});

// =====================
//  Game Logic
// =====================

function createEmptyBoard() {
  const b = [];
  for (let r = 0; r < ROWS; r++) {
    b.push(new Array(COLS).fill(null));
  }
  return b;
}

function startNewRound() {
  board = createEmptyBoard();
  gameActive = true;
  isMyTurn = myColor === 'R';   // Red (host) always goes first
  $overlay.classList.add('hidden');

  // Clear all discs from cells
  cells.forEach(cell => {
    cell.className = 'cell';
    cell.innerHTML = '';
  });

  clearPreview();
  updateTurnIndicator();
  updateScoreDisplay();
}

function getCell(row, col) {
  return $board.querySelector(`.cell[data-row="${row}"][data-col="${col}"]`);
}

function findDropRow(col) {
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r][col] === null) return r;
  }
  return -1;  // column full
}

function dropDisc(col, color, isOpponent) {
  const row = findDropRow(col);
  if (row === -1) return;

  board[row][col] = color;

  // Create disc element with drop animation
  const cell = getCell(row, col);
  const disc = document.createElement('div');
  disc.className = `disc ${color} dropping`;
  disc.style.setProperty('--drop-rows', row + 1);
  cell.appendChild(disc);

  if (isOpponent) {
    isMyTurn = true;
  } else {
    isMyTurn = false;
    gc.send({ type: 'move', column: col, color });
  }

  updateTurnIndicator();
  clearPreview();

  // Check for game over after animation
  setTimeout(() => {
    disc.classList.remove('dropping');
    checkGameOver();
  }, 400);
}

function checkGameOver() {
  const result = getWinner();
  if (result) {
    gameActive = false;
    highlightWin(result.cells);
    scores[result.color]++;
    updateScoreDisplay();

    const iWon = result.color === myColor;
    showOverlay(
      iWon ? 'You Win!' : 'You Lose!',
      `${result.color === 'R' ? 'Red' : 'Yellow'} wins this round`
    );
    return;
  }

  // Check draw: all columns full
  if (board[0].every(c => c !== null)) {
    gameActive = false;
    scores.draws++;
    updateScoreDisplay();
    showOverlay('Draw!', 'The board is full');
  }
}

function getWinner() {
  const directions = [
    [0, 1],   // horizontal
    [1, 0],   // vertical
    [1, 1],   // diagonal down-right
    [1, -1]   // diagonal down-left
  ];

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const color = board[r][c];
      if (!color) continue;

      for (const [dr, dc] of directions) {
        const winCells = [[r, c]];
        for (let step = 1; step < 4; step++) {
          const nr = r + dr * step;
          const nc = c + dc * step;
          if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) break;
          if (board[nr][nc] !== color) break;
          winCells.push([nr, nc]);
        }
        if (winCells.length === 4) {
          return { color, cells: winCells };
        }
      }
    }
  }
  return null;
}

function highlightWin(winCells) {
  for (const [r, c] of winCells) {
    getCell(r, c).classList.add('win');
  }
}

// =====================
//  Board Click
// =====================

$board.addEventListener('click', (e) => {
  const cell = e.target.closest('.cell');
  if (!cell) return;

  const col = parseInt(cell.dataset.col);
  if (!gameActive || !isMyTurn) return;
  if (findDropRow(col) === -1) return;

  dropDisc(col, myColor, false);
});

// =====================
//  Column Hover Preview
// =====================

function clearPreview() {
  previewCells.forEach(pc => { pc.innerHTML = ''; });
  cells.forEach(c => c.classList.remove('col-highlight'));
}

$board.addEventListener('mouseover', (e) => {
  if (!gameActive || !isMyTurn) return;
  const cell = e.target.closest('.cell');
  if (!cell) return;

  const col = parseInt(cell.dataset.col);
  if (findDropRow(col) === -1) return;

  showColumnPreview(col);
});

$board.addEventListener('mouseleave', () => {
  clearPreview();
});

function showColumnPreview(col) {
  clearPreview();

  // Show preview disc above the column
  const previewCell = previewCells[col];
  const preview = document.createElement('div');
  preview.className = `preview-disc ${myColor}`;
  previewCell.appendChild(preview);

  // Highlight empty cells in the column
  for (let r = 0; r < ROWS; r++) {
    if (board[r][col] === null) {
      getCell(r, col).classList.add('col-highlight');
    }
  }
}

// =====================
//  UI Helpers
// =====================

function updateTurnIndicator() {
  if (!gameActive) return;
  $turnText.textContent = isMyTurn ? 'Your turn' : "Opponent's turn";
  $turnText.className = 'turn-indicator' + (isMyTurn ? ' my-turn' : '');
}

function updateScoreDisplay() {
  const myLabel = myColor === 'R' ? 'You (Red)' : 'You (Yellow)';
  const oppLabel = myColor === 'R' ? 'Opp (Yellow)' : 'Opp (Red)';
  const myScore = myColor === 'R' ? scores.R : scores.Y;
  const oppScore = myColor === 'R' ? scores.Y : scores.R;
  $scoreText.textContent = `${myLabel}: ${myScore}  |  ${oppLabel}: ${oppScore}  |  Draws: ${scores.draws}`;
}

function showOverlay(title, msg) {
  $resultTitle.textContent = title;
  $resultMsg.textContent = msg;
  $overlay.classList.remove('hidden');
}

$playAgainBtn.addEventListener('click', () => {
  gc.send({ type: 'play-again' });
  startNewRound();
});

$backMenuBtn.addEventListener('click', () => {
  gc.destroy();
  window.location.href = '../../index.html';
});

// =====================
//  Auto-join from URL
// =====================

(function autoJoinFromURL() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  if (code && code.trim().length >= 4) {
    $codeInput.value = code.trim().toUpperCase();
    $joinBtn.click();
  }
})();
