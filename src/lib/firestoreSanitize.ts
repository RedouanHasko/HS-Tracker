/**
 * Firestore rejects documents containing `undefined` field values.
 * Recursively omit undefined keys before any setDoc / updateDoc write.
 */
export function stripUndefinedForFirestore<T>(value: T): T {
  if (value === undefined) {
    return value;
  }
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefinedForFirestore(item)) as T;
  }
  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    if (val !== undefined) {
      result[key] = stripUndefinedForFirestore(val);
    }
  }
  return result as T;
}
