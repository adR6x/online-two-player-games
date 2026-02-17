/* ===== Connect Four Game Logic ===== */

let gc = new GameConnection('connectfour');
let unsubRoomBrowser = null;

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
const $lobby              = document.getElementById('lobby');
const $gameArea           = document.getElementById('game-area');
const $createBtn          = document.getElementById('create-btn');
const $joinBtn            = document.getElementById('join-btn');
const $codeInput          = document.getElementById('code-input');
const $roomDisplay        = document.getElementById('room-display');
const $roomCode           = document.getElementById('room-code');
const $copyBtn            = document.getElementById('copy-btn');
const $copyLinkBtn        = document.getElementById('copy-link-btn');
const $waitingText        = document.getElementById('waiting-text');
const $connStatus         = document.getElementById('conn-status');
const $board              = document.getElementById('board');
const $previewRow         = document.getElementById('preview-row');
const $turnText           = document.getElementById('turn-text');
const $scoreText          = document.getElementById('score-text');
const $overlay            = document.getElementById('overlay');
const $resultTitle        = document.getElementById('result-title');
const $resultMsg          = document.getElementById('result-msg');
const $playAgainBtn       = document.getElementById('play-again-btn');
const $backMenuBtn        = document.getElementById('back-menu-btn');
const cells               = document.querySelectorAll('.cell');
const previewCells        = document.querySelectorAll('.preview-cell');
const $roomBrowser        = document.getElementById('room-browser');
const $roomList           = document.getElementById('room-list');
const $joinRequestAlert   = document.getElementById('join-request-alert');
const $acceptJoinBtn      = document.getElementById('accept-join-btn');
const $rejectJoinBtn      = document.getElementById('reject-join-btn');
const $joinRequestPending = document.getElementById('join-request-pending');
const $cancelRequestBtn   = document.getElementById('cancel-request-btn');

// =====================
//  Connection Callbacks
// =====================

function wireCallbacks(conn) {
  conn.onConnected = () => {
    $connStatus.textContent = 'Connected!';
    $connStatus.className = 'connection-status connected';
    $lobby.classList.add('hidden');
    $gameArea.classList.remove('hidden');
    stopRoomBrowser();
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

  conn.onJoinRequest = () => {
    $joinRequestAlert.classList.remove('hidden');
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
  $joinRequestAlert.classList.add('hidden');
  $joinRequestPending.classList.add('hidden');
  $roomBrowser.classList.remove('hidden');
  $createBtn.disabled = false;
  $joinBtn.disabled = false;
  $codeInput.disabled = false;
  $codeInput.value = '';

  clearPreview();

  $connStatus.textContent = message;
  $connStatus.className = 'connection-status error';

  startRoomBrowser();
}

wireCallbacks(gc);

// =====================
//  Room Browser
// =====================

function startRoomBrowser() {
  stopRoomBrowser();
  unsubRoomBrowser = GameConnection.listActiveRooms('connectfour', (rooms) => {
    renderRoomList(rooms);
  });
}

function stopRoomBrowser() {
  if (unsubRoomBrowser) {
    unsubRoomBrowser();
    unsubRoomBrowser = null;
  }
}

function renderRoomList(rooms) {
  if (rooms.length === 0) {
    $roomList.innerHTML = '<p class="room-list-empty">No open rooms</p>';
    return;
  }

  $roomList.innerHTML = '';
  for (const room of rooms) {
    const item = document.createElement('div');
    item.className = 'room-list-item';
    item.innerHTML =
      '<span class="room-code-label">' + room.code + '</span>' +
      '<button class="btn btn-small btn-primary ask-join-btn" data-code="' + room.code + '">Ask to Join</button>';
    $roomList.appendChild(item);
  }
}

// Ask to Join click handler (event delegation)
$roomList.addEventListener('click', async (e) => {
  const btn = e.target.closest('.ask-join-btn');
  if (!btn) return;

  const code = btn.dataset.code;

  // Disable lobby, hide browser, show pending UI
  $createBtn.disabled = true;
  $joinBtn.disabled = true;
  $codeInput.disabled = true;
  $roomBrowser.classList.add('hidden');
  $joinRequestPending.classList.remove('hidden');
  $connStatus.textContent = 'Requesting to join...';
  $connStatus.className = 'connection-status';

  try {
    myColor = 'Y';
    await gc.requestToJoin(code);
  } catch (err) {
    $connStatus.textContent = err.message || 'Could not join. Try again.';
    $connStatus.className = 'connection-status error';
    myColor = null;
    $joinRequestPending.classList.add('hidden');
    $roomBrowser.classList.remove('hidden');
    $createBtn.disabled = false;
    $joinBtn.disabled = false;
    $codeInput.disabled = false;

    // Recreate connection for a clean state
    gc.destroy();
    gc = new GameConnection('connectfour');
    wireCallbacks(gc);
  }
});

// Accept / Reject buttons (host side)
$acceptJoinBtn.addEventListener('click', () => {
  gc.acceptJoinRequest();
  $joinRequestAlert.classList.add('hidden');
});

$rejectJoinBtn.addEventListener('click', () => {
  gc.rejectJoinRequest();
  $joinRequestAlert.classList.add('hidden');
});

// Cancel button (requester side)
$cancelRequestBtn.addEventListener('click', () => {
  gc.destroy();
  gc = new GameConnection('connectfour');
  wireCallbacks(gc);

  myColor = null;
  $joinRequestPending.classList.add('hidden');
  $roomBrowser.classList.remove('hidden');
  $createBtn.disabled = false;
  $joinBtn.disabled = false;
  $codeInput.disabled = false;
  $connStatus.textContent = '';
  $connStatus.className = 'connection-status';

  startRoomBrowser();
});

// =====================
//  Lobby Actions
// =====================

$createBtn.addEventListener('click', async () => {
  $createBtn.disabled = true;
  $joinBtn.disabled = true;
  $codeInput.disabled = true;
  $roomBrowser.classList.add('hidden');
  $connStatus.textContent = 'Creating game...';
  $connStatus.className = 'connection-status';
  stopRoomBrowser();

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
    $roomBrowser.classList.remove('hidden');
    $createBtn.disabled = false;
    $joinBtn.disabled = false;
    $codeInput.disabled = false;
    startRoomBrowser();
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
  stopRoomBrowser();

  try {
    myColor = 'Y';
    await gc.joinGame(code);
  } catch {
    $connStatus.textContent = 'Could not join. Check the code and try again.';
    $connStatus.className = 'connection-status error';
    $createBtn.disabled = false;
    $joinBtn.disabled = false;
    $codeInput.disabled = false;
    startRoomBrowser();
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
  stopRoomBrowser();
  gc.destroy();
  window.location.href = '../../index.html';
});

// =====================
//  Init + Auto-join
// =====================

(function init() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  if (code && code.trim().length >= 4) {
    $codeInput.value = code.trim().toUpperCase();
    $joinBtn.click();
  } else {
    startRoomBrowser();
  }
})();
