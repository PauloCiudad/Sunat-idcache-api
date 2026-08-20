export async function withRetry(operation, options = {}) {
  const retries = options.retries ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 2_000;
  const onRetry = options.onRetry ?? (() => undefined);

  let lastError;
  for (let attempt = 1; attempt <= retries + 1; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (error) {
      lastError = error;
      if (attempt > retries) break;

      const delayMs = baseDelayMs * attempt;
      await onRetry({ attempt, nextAttempt: attempt + 1, delayMs, error });
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  throw lastError;
}
