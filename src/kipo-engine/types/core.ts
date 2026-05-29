// ============================================================================
// Core abstractions used throughout the engine
// ============================================================================

/**
 * Result<T, E> — unified result type for operations that can fail.
 * Use this instead of throwing exceptions or ad-hoc result objects.
 * This is the SINGLE result type for the entire engine.
 */
export type Result<T, E> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export function Ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function Err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

/**
 * Safely extracts the error from a Result without requiring type narrowing.
 * Returns undefined if the result is Ok.
 */
export function resultError<T, E>(result: Result<T, E>): E | undefined {
  return result.ok ? undefined : result.error;
}

/**
 * Safely extracts the value from a Result without requiring type narrowing.
 * Returns undefined if the result is an error.
 */
export function resultValue<T, E>(result: Result<T, E>): T | undefined {
  return result.ok ? result.value : undefined;
}
