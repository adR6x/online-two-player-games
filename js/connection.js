/**
 * GameConnection — Firebase Realtime Database connection manager for online games.
 *
 * Usage:
 *   const gc = new GameConnection('tictactoe');
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
  constructor(gameId) {
    if (!gameId) throw new Error('GameConnection requires a gameId');
    this.db = firebase.database();
    this.gameId = gameId;
    this.isHost = false;
    this.roomCode = null;
    this._roomRef = null;
    this._listeners = [];

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
   * Register a Firebase listener so we can clean them all up on destroy().
   */
  _addListener(ref, eventType, callback) {
    ref.on(eventType, callback);
    this._listeners.push({ ref, eventType, callback });
  }

  /**
   * Host a new game. Resolves with the room code once the room is created.
   */
  createGame() {
    return new Promise(async (resolve, reject) => {
      this.isHost = true;
      this.roomCode = this._generateCode();

      try {
        // Check if room already exists (code collision)
        const roomRef = this.db.ref('rooms/' + this.gameId + '/' + this.roomCode);
        const snapshot = await roomRef.once('value');
        if (snapshot.exists()) {
          // Collision — generate a new code
          this.roomCode = this._generateCode();
        }

        this._roomRef = this.db.ref('rooms/' + this.gameId + '/' + this.roomCode);

        // Create the room
        await this._roomRef.set({
          host: true,
          guest: false
        });

        // Set up auto-cleanup when host disconnects
        this._roomRef.child('host').onDisconnect().set(false);

        // Listen for guest to join
        const guestRef = this._roomRef.child('guest');
        this._addListener(guestRef, 'value', (snap) => {
          if (snap.val() === true) {
            this._setupMessageListener();
            this._setupDisconnectListener('guest');
            if (this.onConnected) this.onConnected();
          }
        });

        resolve(this.roomCode);
      } catch (err) {
        this._handleError(err);
        reject(err);
      }
    });
  }

  /**
   * Join an existing game by room code. Resolves once connected.
   */
  joinGame(code) {
    return new Promise(async (resolve, reject) => {
      this.isHost = false;
      this.roomCode = code.toUpperCase().trim();
      this._roomRef = this.db.ref('rooms/' + this.gameId + '/' + this.roomCode);

      try {
        // Verify room exists and host is present
        const snapshot = await this._roomRef.once('value');
        if (!snapshot.exists() || !snapshot.val().host) {
          const err = new Error('Room not found. Check the code and try again.');
          this._handleError(err);
          reject(err);
          return;
        }

        // Mark guest as joined
        await this._roomRef.child('guest').set(true);

        // Set up auto-cleanup when guest disconnects
        this._roomRef.child('guest').onDisconnect().set(false);

        // Set up message and disconnect listeners
        this._setupMessageListener();
        this._setupDisconnectListener('host');

        if (this.onConnected) this.onConnected();
        resolve();
      } catch (err) {
        this._handleError(err);
        reject(err);
      }
    });
  }

  /**
   * Listen for new messages, filtering out our own.
   */
  _setupMessageListener() {
    const messagesRef = this._roomRef.child('messages');
    const myRole = this.isHost ? 'host' : 'guest';

    this._addListener(messagesRef, 'child_added', (snap) => {
      const msg = snap.val();
      if (msg && msg.from !== myRole) {
        if (this.onData) this.onData(msg.data);
      }
    });
  }

  /**
   * Watch the other player's presence flag and fire onDisconnected if they leave.
   */
  _setupDisconnectListener(otherRole) {
    const otherRef = this._roomRef.child(otherRole);
    this._addListener(otherRef, 'value', (snap) => {
      // Fire disconnect when value becomes false (onDisconnect) or null (room deleted)
      if (!snap.val()) {
        if (this.onDisconnected) this.onDisconnected();
      }
    });
  }

  /**
   * Send a JSON-serialisable object to the other player.
   */
  send(data) {
    if (!this._roomRef) return;
    const myRole = this.isHost ? 'host' : 'guest';
    this._roomRef.child('messages').push({
      from: myRole,
      data: data
    });
  }

  /**
   * Internal error handler.
   */
  _handleError(err) {
    console.error('[GameConnection]', err);
    if (this.onError) this.onError(err);
  }

  /**
   * Cleanly tear down listeners and remove room data.
   */
  destroy() {
    // Remove all listeners
    for (const { ref, eventType, callback } of this._listeners) {
      ref.off(eventType, callback);
    }
    this._listeners = [];

    // Cancel onDisconnect handlers and remove room
    if (this._roomRef) {
      this._roomRef.child('host').onDisconnect().cancel();
      this._roomRef.child('guest').onDisconnect().cancel();
      this._roomRef.remove();
      this._roomRef = null;
    }
  }
}
