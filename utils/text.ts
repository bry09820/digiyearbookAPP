/**
 * Coerce unknown API values into a string safe for React Native <Text>.
 * Prevents "Objects are not valid as a React child" crashes.
 */
export function asText(value: unknown, fallback = ''): string {
  if (value == null) return fallback;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || fallback;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const nested =
      obj.name ??
      obj.full_name ??
      obj.title ??
      obj.label ??
      obj.value ??
      obj.message ??
      obj.email;
    if (nested != null && nested !== value) {
      return asText(nested, fallback);
    }
  }
  return fallback;
}

/** Prefer the first non-empty asText result. */
export function firstText(...candidates: unknown[]): string {
  for (const candidate of candidates) {
    const text = asText(candidate);
    if (text) return text;
  }
  return '';
}
