import bcrypt from 'bcryptjs';

/**
 * Password hashing. bcrypt with a cost of 12 keeps interactive logins under
 * ~250ms on this class of hardware while remaining expensive to brute force.
 */
const BCRYPT_COST = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_COST);
}

export async function verifyPassword(
  plain: string,
  hash: string,
): Promise<boolean> {
  try {
    return await bcrypt.compare(plain, hash);
  } catch {
    return false;
  }
}

/**
 * Constant-work comparison used when an account does not exist, so response
 * timing does not reveal which emails are registered.
 */
export async function dummyPasswordCheck(): Promise<void> {
  await bcrypt.compare(
    'timing-equalisation-placeholder',
    '$2a$12$C6UzMDM.H6dfI/f/IKcEeO1M8VJ0/8XKpQ9Xk1kR7lQwZ8jY6t8Xe',
  );
}

/** URL-safe random token for password resets and similar one-shot links. */
export function generateToken(bytes = 32): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function hashToken(token: string): Promise<string> {
  const data = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
}
