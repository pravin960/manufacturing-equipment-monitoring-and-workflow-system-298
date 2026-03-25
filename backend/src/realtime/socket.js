let ioInstance = null;

/**
 * PUBLIC_INTERFACE
 * Initialize Socket.IO and store the singleton instance.
 * @param {import('socket.io').Server} io
 * @returns {import('socket.io').Server}
 */
function initSocket(io) {
  ioInstance = io;
  return ioInstance;
}

/**
 * PUBLIC_INTERFACE
 * Get Socket.IO instance after init.
 * @returns {import('socket.io').Server | null}
 */
function getIO() {
  return ioInstance;
}

module.exports = { initSocket, getIO };

