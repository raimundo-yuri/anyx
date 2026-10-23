/** Expected validation failure, safe to describe to the user without storage internals. */
export class FinanceError extends Error {
  constructor(message: string) { super(message); this.name = 'FinanceError'; }
}
