/**
 * Exception for pool not initialized
 */
export class PoolManagerNotInitializedException extends Error {
  constructor() {
    super('Pool manager not initialized! Please boot pool manager first!');
    this.name = 'PoolNotInitializedException';
  }
}

/**
 * Exception for session callback function
 */
export class SessionCallbackException extends Error {
  constructor(message: string) {
    super(`Exception occured while callback: ${message}`);
    this.name = 'SessionCallbackException';
  }
}
