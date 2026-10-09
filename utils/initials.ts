import { asText } from '@/utils/text';

/** Build initials like "MR", "MM", "PK" from a display name. */
export function getInitials(name: unknown, fallback = '?'): string {
  const cleaned = asText(name)
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return fallback;

  const parts = cleaned
    .split(' ')
    .map((part) => part.replace(/[^a-zA-Z0-9]/g, ''))
    .filter(Boolean);

  if (parts.length === 0) return fallback;
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();

  const first = parts[0][0] || '';
  const last = parts[parts.length - 1][0] || '';
  return `${first}${last}`.toUpperCase() || fallback;
}
