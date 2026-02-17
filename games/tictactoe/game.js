/* ===== Tic-Tac-Toe Game Logic ===== */

let gc = new GameConnection('tictactoe');
let unsubRoomBrowser = null;

// --- State ---
let board = Array(9).fill(null);   // null | 'X' | 'O'
let mySymbol = null;               // 'X' for host, 'O' for guest
let isMyTurn = false;
let gameActive = false;
let roundNumber = 0;
let scores = { X: 0, O: 0, draws: 0 };

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
const $turnText           = document.getElementById('turn-text');
const $scoreText          = document.getElementById('score-text');
const $overlay            = document.getElementById('overlay');
const $resultTitle        = document.getElementById('result-title');
const $resultMsg          = document.getElementById('result-msg');
const $playAgainBtn       = document.getElementById('play-again-btn');
const $backMenuBtn        = document.getElementById('back-menu-btn');
const cells               = document.querySelectorAll('.cell');
const $roomBrowser        = document.getElementById('room-browser');
const $roomList           = document.getElementById('room-list');
const $joinRequestAlert   = document.getElementById('join-request-alert');
const $acceptJoinBtn      = document.getElementById('accept-join-btn');
const $rejectJoinBtn      = document.getElementById('reject-join-btn');
const $joinRequestPending = document.getElementById('join-request-pending');
const $cancelRequestBtn   = document.getElementById('cancel-request-btn');

// --- Win patterns ---
const WIN_PATTERNS = [
  [0,1,2],[3,4,5],[6,7,8], // rows
  [0,3,6],[1,4,7],[2,5,8], // cols
  [0,4,8],[2,4,6]          // diags
];

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
        applyMove(data.index, data.symbol);
        isMyTurn = true;
        updateTurnIndicator();
        checkGameOver();
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
  gc = new GameConnection('tictactoe');
  wireCallbacks(gc);

  // Reset game state
  board = Array(9).fill(null);
  mySymbol = null;
  roundNumber = 0;
  scores = { X: 0, O: 0, draws: 0 };

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
  unsubRoomBrowser = GameConnection.listActiveRooms('tictactoe', (rooms) => {
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
    mySymbol = 'O';
    await gc.requestToJoin(code);
  } catch (err) {
    $connStatus.textContent = err.message || 'Could not join. Try again.';
    $connStatus.className = 'connection-status error';
    mySymbol = null;
    $joinRequestPending.classList.add('hidden');
    $roomBrowser.classList.remove('hidden');
    $createBtn.disabled = false;
    $joinBtn.disabled = false;
    $codeInput.disabled = false;

    // Recreate connection for a clean state
    gc.destroy();
    gc = new GameConnection('tictactoe');
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
  gc = new GameConnection('tictactoe');
  wireCallbacks(gc);

  mySymbol = null;
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
    mySymbol = 'X';
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
    mySymbol = 'O';
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

function startNewRound() {
  board = Array(9).fill(null);
  gameActive = true;
  roundNumber++;
  // Round 1: X goes first, Round 2: O goes first, etc.
  const hostGoesFirst = roundNumber % 2 === 1;
  isMyTurn = (mySymbol === 'X') === hostGoesFirst;
  $overlay.classList.add('hidden');

  cells.forEach((cell, i) => {
    cell.textContent = '';
    cell.className = 'cell';
    cell.dataset.index = i;
  });

  updateTurnIndicator();
  updateScoreDisplay();
}

function applyMove(index, symbol) {
  board[index] = symbol;
  const cell = cells[index];
  cell.textContent = symbol;
  cell.classList.add(symbol === 'X' ? 'x' : 'o');
}

function checkGameOver() {
  const winner = getWinner();
  if (winner) {
    gameActive = false;
    highlightWin(winner.pattern);
    scores[winner.symbol]++;
    updateScoreDisplay();

    const iWon = winner.symbol === mySymbol;
    showOverlay(
      iWon ? 'You Win!' : 'You Lose!',
      `${winner.symbol} wins this round`
    );
    return;
  }

  if (board.every(c => c !== null)) {
    gameActive = false;
    scores.draws++;
    updateScoreDisplay();
    showOverlay('Draw!', 'No one wins this round');
  }
}

function getWinner() {
  for (const pattern of WIN_PATTERNS) {
    const [a, b, c] = pattern;
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return { symbol: board[a], pattern };
    }
  }
  return null;
}

function highlightWin(pattern) {
  pattern.forEach(i => cells[i].classList.add('win'));
}

// =====================
//  Board Click
// =====================

$board.addEventListener('click', (e) => {
  const cell = e.target.closest('.cell');
  if (!cell) return;

  const index = parseInt(cell.dataset.index);

  if (!gameActive || !isMyTurn || board[index] !== null) return;

  applyMove(index, mySymbol);
  isMyTurn = false;
  updateTurnIndicator();
  gc.send({ type: 'move', index, symbol: mySymbol });
  checkGameOver();
});

// =====================
//  UI Helpers
// =====================

function updateTurnIndicator() {
  if (!gameActive) return;
  $turnText.textContent = isMyTurn ? 'Your turn' : "Opponent's turn";
  $turnText.className = 'turn-indicator' + (isMyTurn ? ' my-turn' : '');
}

function updateScoreDisplay() {
  const myLabel = mySymbol === 'X' ? 'You (X)' : 'You (O)';
  const oppLabel = mySymbol === 'X' ? 'Opp (O)' : 'Opp (X)';
  const myScore = mySymbol === 'X' ? scores.X : scores.O;
  const oppScore = mySymbol === 'X' ? scores.O : scores.X;
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
