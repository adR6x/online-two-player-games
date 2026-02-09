/* ===== Tic-Tac-Toe Game Logic ===== */

const gc = new GameConnection();

// --- State ---
let board = Array(9).fill(null);   // null | 'X' | 'O'
let mySymbol = null;               // 'X' for host, 'O' for guest
let isMyTurn = false;
let gameActive = false;
let scores = { X: 0, O: 0, draws: 0 };

// --- DOM refs ---
const $lobby        = document.getElementById('lobby');
const $gameArea     = document.getElementById('game-area');
const $createBtn    = document.getElementById('create-btn');
const $joinBtn      = document.getElementById('join-btn');
const $codeInput    = document.getElementById('code-input');
const $roomDisplay  = document.getElementById('room-display');
const $roomCode     = document.getElementById('room-code');
const $copyBtn      = document.getElementById('copy-btn');
const $waitingText  = document.getElementById('waiting-text');
const $connStatus   = document.getElementById('conn-status');
const $board        = document.getElementById('board');
const $turnText     = document.getElementById('turn-text');
const $scoreText    = document.getElementById('score-text');
const $overlay      = document.getElementById('overlay');
const $resultTitle  = document.getElementById('result-title');
const $resultMsg    = document.getElementById('result-msg');
const $playAgainBtn = document.getElementById('play-again-btn');
const $backMenuBtn  = document.getElementById('back-menu-btn');
const cells         = document.querySelectorAll('.cell');

// --- Win patterns ---
const WIN_PATTERNS = [
  [0,1,2],[3,4,5],[6,7,8], // rows
  [0,3,6],[1,4,7],[2,5,8], // cols
  [0,4,8],[2,4,6]          // diags
];

// =====================
//  Connection Callbacks
// =====================

gc.onConnected = () => {
  $connStatus.textContent = 'Connected!';
  $connStatus.className = 'connection-status connected';
  $lobby.classList.add('hidden');
  $gameArea.classList.remove('hidden');
  startNewRound();
};

gc.onData = (data) => {
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

gc.onDisconnected = () => {
  $connStatus.textContent = 'Opponent disconnected';
  $connStatus.className = 'connection-status error';
  gameActive = false;
};

gc.onError = (err) => {
  $connStatus.textContent = 'Connection error: ' + (err.type || err.message || err);
  $connStatus.className = 'connection-status error';
};

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
    mySymbol = 'X';
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
    mySymbol = 'O';
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
  isMyTurn = mySymbol === 'X';   // X always goes first
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
  gc.destroy();
  window.location.href = '../../index.html';
});
