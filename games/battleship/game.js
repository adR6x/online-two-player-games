/* ===== Battleship Game Logic ===== */

let gc = new GameConnection('battleship');
let unsubRoomBrowser = null;

// --- Constants ---
const ROWS = 10;
const COLS = 10;
const SHIPS = [
  { name: 'carrier',    size: 5 },
  { name: 'battleship', size: 4 },
  { name: 'cruiser',    size: 3 },
  { name: 'submarine',  size: 3 },
  { name: 'destroyer',  size: 2 }
];

// --- State ---
let myBoard = [];          // myBoard[r][c] = null | shipName
let opponentBoard = [];    // opponentBoard[r][c] = null | 'hit' | 'miss'
let myHitsReceived = [];   // myHitsReceived[r][c] = true/false (where opponent hit me)
let myShips = {};          // { carrier: { cells: [[r,c],...], hits: 0, sunk: false }, ... }
let opponentShipsRemaining = 5;
let isMyTurn = false;
let gameActive = false;
let isHost = false;
let hostGoesFirst = true;
let scores = { wins: 0, losses: 0 };

// Placement state
let selectedShip = null;
let isHorizontal = true;
let placedShips = {};      // { shipName: { cells: [[r,c],...] } }
let myReady = false;
let opponentReady = false;

// --- DOM refs ---
const $lobby              = document.getElementById('lobby');
const $placementArea      = document.getElementById('placement-area');
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
const $placementBoard     = document.getElementById('placement-board');
const $opponentBoard      = document.getElementById('opponent-board');
const $myBoard            = document.getElementById('my-board');
const $turnText           = document.getElementById('turn-text');
const $scoreText          = document.getElementById('score-text');
const $overlay            = document.getElementById('overlay');
const $waitingOverlay     = document.getElementById('waiting-overlay');
const $resultTitle        = document.getElementById('result-title');
const $resultMsg          = document.getElementById('result-msg');
const $playAgainBtn       = document.getElementById('play-again-btn');
const $backMenuBtn        = document.getElementById('back-menu-btn');
const $rotateBtn          = document.getElementById('rotate-btn');
const $randomBtn          = document.getElementById('random-btn');
const $clearBtn           = document.getElementById('clear-btn');
const $readyBtn           = document.getElementById('ready-btn');
const $instruction        = document.getElementById('placement-instruction');
const shipOptions         = document.querySelectorAll('.ship-option');
const $roomBrowser        = document.getElementById('room-browser');
const $roomList           = document.getElementById('room-list');
const $joinRequestAlert   = document.getElementById('join-request-alert');
const $acceptJoinBtn      = document.getElementById('accept-join-btn');
const $rejectJoinBtn      = document.getElementById('reject-join-btn');
const $joinRequestPending = document.getElementById('join-request-pending');
const $cancelRequestBtn   = document.getElementById('cancel-request-btn');

// =====================
//  Board Initialization
// =====================

function createEmptyBoard() {
  const b = [];
  for (let r = 0; r < ROWS; r++) {
    b.push(new Array(COLS).fill(null));
  }
  return b;
}

function createBoolBoard() {
  const b = [];
  for (let r = 0; r < ROWS; r++) {
    b.push(new Array(COLS).fill(false));
  }
  return b;
}

function buildGridCells(container) {
  container.innerHTML = '';
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const cell = document.createElement('div');
      cell.className = 'bs-cell';
      cell.dataset.row = r;
      cell.dataset.col = c;
      container.appendChild(cell);
    }
  }
}

function getCell(container, row, col) {
  return container.querySelector(`.bs-cell[data-row="${row}"][data-col="${col}"]`);
}

// Build all three grids
buildGridCells($placementBoard);
buildGridCells($opponentBoard);
buildGridCells($myBoard);

// =====================
//  Connection Callbacks
// =====================

function wireCallbacks(conn) {
  conn.onConnected = () => {
    $connStatus.textContent = 'Connected!';
    $connStatus.className = 'connection-status connected';
    $lobby.classList.add('hidden');
    stopRoomBrowser();
    startPlacementPhase();
  };

  conn.onData = (data) => {
    switch (data.type) {
      case 'ready':
        opponentReady = true;
        checkBothReady();
        break;
      case 'fire':
        handleIncomingFire(data.row, data.col);
        break;
      case 'result':
        handleFireResult(data);
        break;
      case 'play-again':
        if (!gameActive) {
          hostGoesFirst = data.hostGoesFirst;
          startPlacementPhase();
        }
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
  gc = new GameConnection('battleship');
  wireCallbacks(gc);

  // Reset state
  myBoard = [];
  opponentBoard = [];
  myShips = {};
  placedShips = {};
  selectedShip = null;
  isHorizontal = true;
  myReady = false;
  opponentReady = false;
  hostGoesFirst = true;
  scores = { wins: 0, losses: 0 };

  // Reset UI
  $gameArea.classList.add('hidden');
  $placementArea.classList.add('hidden');
  $overlay.classList.add('hidden');
  $waitingOverlay.classList.add('hidden');
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
  unsubRoomBrowser = GameConnection.listActiveRooms('battleship', (rooms) => {
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
    isHost = false;
    await gc.requestToJoin(code);
  } catch (err) {
    $connStatus.textContent = err.message || 'Could not join. Try again.';
    $connStatus.className = 'connection-status error';
    $joinRequestPending.classList.add('hidden');
    $roomBrowser.classList.remove('hidden');
    $createBtn.disabled = false;
    $joinBtn.disabled = false;
    $codeInput.disabled = false;

    // Recreate connection for a clean state
    gc.destroy();
    gc = new GameConnection('battleship');
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
  gc = new GameConnection('battleship');
  wireCallbacks(gc);

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
    isHost = true;
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
    isHost = false;
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
//  Placement Phase
// =====================

function startPlacementPhase() {
  // Reset placement state
  myBoard = createEmptyBoard();
  opponentBoard = createEmptyBoard();
  myHitsReceived = createBoolBoard();
  myShips = {};
  placedShips = {};
  selectedShip = null;
  isHorizontal = true;
  myReady = false;
  opponentReady = false;
  opponentShipsRemaining = 5;

  // Reset UI
  $overlay.classList.add('hidden');
  $waitingOverlay.classList.add('hidden');
  $gameArea.classList.add('hidden');
  $placementArea.classList.remove('hidden');
  $readyBtn.disabled = true;
  $instruction.textContent = 'Select a ship, then click the grid to place it';

  // Reset ship option buttons
  shipOptions.forEach(opt => {
    opt.classList.remove('selected', 'placed');
  });

  // Rebuild placement grid
  buildGridCells($placementBoard);

  updateScoreDisplay();
}

// Ship selection
shipOptions.forEach(opt => {
  opt.addEventListener('click', () => {
    const name = opt.dataset.ship;
    if (placedShips[name]) return;

    shipOptions.forEach(o => o.classList.remove('selected'));
    opt.classList.add('selected');
    selectedShip = SHIPS.find(s => s.name === name);
  });
});

// Rotate
$rotateBtn.addEventListener('click', () => {
  isHorizontal = !isHorizontal;
  $rotateBtn.textContent = isHorizontal ? 'Rotate (R)' : 'Rotate (R)';
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'r' || e.key === 'R') {
    if (!$placementArea.classList.contains('hidden')) {
      isHorizontal = !isHorizontal;
    }
  }
});

// Get cells a ship would occupy
function getShipCells(row, col, size, horizontal) {
  const cells = [];
  for (let i = 0; i < size; i++) {
    const r = horizontal ? row : row + i;
    const c = horizontal ? col + i : col;
    cells.push([r, c]);
  }
  return cells;
}

// Validate ship placement
function isValidPlacement(cells) {
  for (const [r, c] of cells) {
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return false;
    if (myBoard[r][c] !== null) return false;
  }
  return true;
}

// Placement board hover preview
$placementBoard.addEventListener('mouseover', (e) => {
  const cell = e.target.closest('.bs-cell');
  if (!cell || !selectedShip) return;
  clearPreview();

  const row = parseInt(cell.dataset.row);
  const col = parseInt(cell.dataset.col);
  const cells = getShipCells(row, col, selectedShip.size, isHorizontal);
  const valid = isValidPlacement(cells);

  cells.forEach(([r, c]) => {
    if (r >= 0 && r < ROWS && c >= 0 && c < COLS) {
      const el = getCell($placementBoard, r, c);
      if (el) el.classList.add(valid ? 'preview' : 'preview-invalid');
    }
  });
});

$placementBoard.addEventListener('mouseleave', () => {
  clearPreview();
});

function clearPreview() {
  $placementBoard.querySelectorAll('.bs-cell').forEach(c => {
    c.classList.remove('preview', 'preview-invalid');
  });
}

// Place ship on click
$placementBoard.addEventListener('click', (e) => {
  const cell = e.target.closest('.bs-cell');
  if (!cell || !selectedShip) return;

  const row = parseInt(cell.dataset.row);
  const col = parseInt(cell.dataset.col);
  const cells = getShipCells(row, col, selectedShip.size, isHorizontal);

  if (!isValidPlacement(cells)) return;

  // Place the ship
  cells.forEach(([r, c]) => {
    myBoard[r][c] = selectedShip.name;
    const el = getCell($placementBoard, r, c);
    el.classList.add('ship');
    el.classList.remove('preview');
    el.dataset.ship = selectedShip.name;
  });

  placedShips[selectedShip.name] = { cells };

  // Mark ship option as placed
  const opt = document.querySelector(`.ship-option[data-ship="${selectedShip.name}"]`);
  opt.classList.remove('selected');
  opt.classList.add('placed');

  selectedShip = null;

  // Check if all ships placed
  if (Object.keys(placedShips).length === SHIPS.length) {
    $readyBtn.disabled = false;
    $instruction.textContent = 'All ships placed! Click Ready when done.';
  } else {
    $instruction.textContent = 'Select the next ship to place';
  }
});

// Random placement
$randomBtn.addEventListener('click', () => {
  clearAllShips();

  for (const ship of SHIPS) {
    let placed = false;
    let attempts = 0;
    while (!placed && attempts < 200) {
      attempts++;
      const horizontal = Math.random() < 0.5;
      const row = Math.floor(Math.random() * ROWS);
      const col = Math.floor(Math.random() * COLS);
      const cells = getShipCells(row, col, ship.size, horizontal);

      if (isValidPlacement(cells)) {
        cells.forEach(([r, c]) => {
          myBoard[r][c] = ship.name;
          const el = getCell($placementBoard, r, c);
          el.classList.add('ship');
          el.dataset.ship = ship.name;
        });
        placedShips[ship.name] = { cells };
        placed = true;
      }
    }
  }

  // Update ship options UI
  shipOptions.forEach(opt => {
    opt.classList.remove('selected');
    opt.classList.add('placed');
  });
  selectedShip = null;
  $readyBtn.disabled = false;
  $instruction.textContent = 'All ships placed! Click Ready when done.';
});

// Clear all ships
function clearAllShips() {
  myBoard = createEmptyBoard();
  placedShips = {};
  selectedShip = null;

  $placementBoard.querySelectorAll('.bs-cell').forEach(c => {
    c.classList.remove('ship', 'preview', 'preview-invalid');
    delete c.dataset.ship;
  });

  shipOptions.forEach(opt => {
    opt.classList.remove('selected', 'placed');
  });

  $readyBtn.disabled = true;
  $instruction.textContent = 'Select a ship, then click the grid to place it';
}

$clearBtn.addEventListener('click', clearAllShips);

// Ready button
$readyBtn.addEventListener('click', () => {
  if (Object.keys(placedShips).length < SHIPS.length) return;

  myReady = true;

  // Build myShips data from placedShips
  for (const ship of SHIPS) {
    myShips[ship.name] = {
      cells: placedShips[ship.name].cells,
      hits: 0,
      sunk: false,
      size: ship.size
    };
  }

  gc.send({ type: 'ready' });
  checkBothReady();
});

function checkBothReady() {
  if (myReady && opponentReady) {
    startBattle();
  } else if (myReady) {
    $waitingOverlay.classList.remove('hidden');
  }
}

// =====================
//  Battle Phase
// =====================

function startBattle() {
  $placementArea.classList.add('hidden');
  $waitingOverlay.classList.add('hidden');
  $gameArea.classList.remove('hidden');

  gameActive = true;
  isMyTurn = isHost === hostGoesFirst;

  // Render my board with ships
  buildGridCells($myBoard);
  buildGridCells($opponentBoard);

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (myBoard[r][c] !== null) {
        const cell = getCell($myBoard, r, c);
        cell.classList.add('ship');
        cell.dataset.ship = myBoard[r][c];
      }
    }
  }

  updateTurnIndicator();
  updateScoreDisplay();
}

// Fire at opponent's board
$opponentBoard.addEventListener('click', (e) => {
  const cell = e.target.closest('.bs-cell');
  if (!cell) return;
  if (!gameActive || !isMyTurn) return;

  const row = parseInt(cell.dataset.row);
  const col = parseInt(cell.dataset.col);

  // Can't fire at same spot twice
  if (opponentBoard[row][col] !== null) return;

  isMyTurn = false;
  updateTurnIndicator();
  gc.send({ type: 'fire', row, col });
});

// Handle incoming fire from opponent
function handleIncomingFire(row, col) {
  const shipName = myBoard[row][col];
  const hit = shipName !== null;
  let sunk = false;
  let gameOver = false;

  if (hit) {
    myHitsReceived[row][col] = true;
    myShips[shipName].hits++;

    if (myShips[shipName].hits === myShips[shipName].size) {
      myShips[shipName].sunk = true;
      sunk = true;
    }

    // Check if all my ships are sunk
    gameOver = Object.values(myShips).every(s => s.sunk);
  }

  // Mark hit/miss on my board display
  const myCell = getCell($myBoard, row, col);
  myCell.classList.add(hit ? 'hit' : 'miss');

  // Send result back
  const result = { type: 'result', row, col, hit, sunk, gameOver };
  if (sunk) {
    result.shipCells = myShips[shipName].cells;
  }
  gc.send(result);

  if (gameOver) {
    gameActive = false;
    scores.losses++;
    updateScoreDisplay();
    showOverlay('You Lose!', 'Your fleet has been sunk');
  } else if (!hit) {
    // Opponent missed, now it's my turn
    isMyTurn = true;
    updateTurnIndicator();
  }
  // If hit (but not game over), opponent goes again
}

// Handle result of my fire
function handleFireResult(data) {
  const { row, col, hit, sunk, gameOver, shipCells } = data;

  opponentBoard[row][col] = hit ? 'hit' : 'miss';
  const cell = getCell($opponentBoard, row, col);
  cell.classList.add(hit ? 'hit' : 'miss');

  if (sunk && shipCells) {
    // Mark all cells of sunk ship
    for (const [r, c] of shipCells) {
      const sunkCell = getCell($opponentBoard, r, c);
      sunkCell.classList.add('sunk');
    }
    opponentShipsRemaining--;
  }

  if (gameOver) {
    gameActive = false;
    scores.wins++;
    updateScoreDisplay();
    showOverlay('You Win!', "You sank your opponent's entire fleet!");
  } else if (hit) {
    // Hit — I go again
    isMyTurn = true;
    updateTurnIndicator();
  } else {
    // Miss — opponent's turn
    isMyTurn = false;
    updateTurnIndicator();
  }
}

// =====================
//  UI Helpers
// =====================

function updateTurnIndicator() {
  if (!gameActive) return;
  $turnText.textContent = isMyTurn ? 'Your turn — fire!' : "Opponent's turn";
  $turnText.className = 'turn-indicator' + (isMyTurn ? ' my-turn' : '');
}

function updateScoreDisplay() {
  $scoreText.textContent = `Wins: ${scores.wins}  |  Losses: ${scores.losses}`;
}

function showOverlay(title, msg) {
  $resultTitle.textContent = title;
  $resultMsg.textContent = msg;
  $overlay.classList.remove('hidden');
}

$playAgainBtn.addEventListener('click', () => {
  hostGoesFirst = !hostGoesFirst;
  gc.send({ type: 'play-again', hostGoesFirst });
  startPlacementPhase();
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
