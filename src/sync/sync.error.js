export class SyncError extends Error {
  constructor(result, { cause, statusCode = 502 } = {}) {
    super(result.message, { cause });
    this.name = "SyncError";
    this.result = result;
    this.statusCode = statusCode;
  }
}
