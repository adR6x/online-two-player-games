/**
 * GameConnection — Reusable PeerJS connection manager for P2P games.
 *
 * Usage:
 *   const gc = new GameConnection();
 *   gc.onConnected = () => { ... };
 *   gc.onData = (data) => { ... };
 *   gc.onDisconnected = () => { ... };
 *   gc.onError = (err) => { ... };
 *
 *   // Host
 *   const code = await gc.createGame();
 *
 *   // Guest
 *   await gc.joinGame(code);
 *
 *   // Send
 *   gc.send({ type: 'move', index: 4 });
 */

class GameConnection {
  constructor() {
    this.peer = null;
    this.conn = null;
    this.isHost = false;
    this.roomCode = null;

    // Callbacks — assign these before calling createGame / joinGame
    this.onConnected = null;
    this.onData = null;
    this.onDisconnected = null;
    this.onError = null;
  }

  /**
   * Generate a short random room code (6 uppercase alphanumeric chars).
   */
  _generateCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous chars
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  /**
   * Host a new game. Resolves with the room code once the PeerJS peer is ready.
   */
  createGame() {
    return new Promise((resolve, reject) => {
      this.isHost = true;
      this.roomCode = this._generateCode();
      const peerId = 'otpg_' + this.roomCode;

      this.peer = new Peer(peerId);

      this.peer.on('open', () => {
        resolve(this.roomCode);
      });

      this.peer.on('connection', (conn) => {
        this.conn = conn;
        this._waitForOpen(conn);
      });

      this.peer.on('error', (err) => {
        if (err.type === 'unavailable-id') {
          // Code collision — try again with a new code
          this.peer.destroy();
          this.roomCode = this._generateCode();
          const retryId = 'otpg_' + this.roomCode;
          this.peer = new Peer(retryId);
          this.peer.on('open', () => resolve(this.roomCode));
          this.peer.on('connection', (conn) => {
            this.conn = conn;
            this._waitForOpen(conn);
          });
          this.peer.on('error', (e) => {
            this._handleError(e);
            reject(e);
          });
        } else {
          this._handleError(err);
          reject(err);
        }
      });
    });
  }

  /**
   * Join an existing game by room code. Resolves once the connection is open.
   */
  joinGame(code) {
    return new Promise((resolve, reject) => {
      this.isHost = false;
      this.roomCode = code.toUpperCase().trim();
      const peerId = 'otpg_guest_' + this._generateCode();
      const hostId = 'otpg_' + this.roomCode;

      this.peer = new Peer(peerId);

      this.peer.on('open', () => {
        this.conn = this.peer.connect(hostId, { reliable: true });

        this._waitForOpen(this.conn).then(resolve).catch(reject);

        this.conn.on('error', (err) => {
          this._handleError(err);
          reject(err);
        });
      });

      this.peer.on('error', (err) => {
        this._handleError(err);
        reject(err);
      });
    });
  }

  /**
   * Wait for a DataConnection to be open, then set up handlers.
   * Handles the case where the connection is already open.
   */
  _waitForOpen(conn) {
    return new Promise((resolve, reject) => {
      if (conn.open) {
        this._setupConnection();
        resolve();
        return;
      }

      const timeout = setTimeout(() => {
        reject(new Error('Connection timed out'));
        this._handleError({ type: 'timeout', message: 'Connection timed out' });
      }, 15000);

      conn.on('open', () => {
        clearTimeout(timeout);
        this._setupConnection();
        resolve();
      });
    });
  }

  /**
   * Set up data and close handlers on the active connection.
   */
  _setupConnection() {
    if (this.onConnected) this.onConnected();

    this.conn.on('data', (data) => {
      if (this.onData) this.onData(data);
    });

    this.conn.on('close', () => {
      if (this.onDisconnected) this.onDisconnected();
    });
  }

  /**
   * Send a JSON-serialisable object to the peer.
   */
  send(data) {
    if (this.conn && this.conn.open) {
      this.conn.send(data);
    }
  }

  /**
   * Internal error handler.
   */
  _handleError(err) {
    console.error('[GameConnection]', err);
    if (this.onError) this.onError(err);
  }

  /**
   * Cleanly tear down the connection and peer.
   */
  destroy() {
    if (this.conn) this.conn.close();
    if (this.peer) this.peer.destroy();
    this.conn = null;
    this.peer = null;
  }
}
