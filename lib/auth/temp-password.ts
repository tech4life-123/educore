import "server-only";

import { randomInt } from "node:crypto";

// No look-alike characters (0/O, 1/l/I) — these get read aloud and hand-copied.
const LETTERS = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ";
const DIGITS = "23456789";
const ALL = LETTERS + DIGITS;

/**
 * One-time password shown to an admin exactly once, e.g. "Kp7m-q4xZ-9h".
 * ~62 bits of entropy from a CSPRNG; the user must replace it at first login.
 */
export function generateTemporaryPassword(): string {
  const chars: string[] = [];
  for (let i = 0; i < 10; i++) chars.push(ALL[randomInt(ALL.length)]);
  // Guarantee at least one digit and one letter.
  const digitAt = randomInt(10);
  const letterAt = (digitAt + 1 + randomInt(9)) % 10; // always a different slot
  chars[digitAt] = DIGITS[randomInt(DIGITS.length)];
  chars[letterAt] = LETTERS[randomInt(LETTERS.length)];
  const s = chars.join("");
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8)}`;
}
