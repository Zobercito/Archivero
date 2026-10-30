import { hash, verify } from '@node-rs/argon2';

const options = {
  // 2 = Argon2id; se evita el const enum para no romper verbatimModuleSyntax.
  algorithm: 2,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
};

export function hashPassword(password: string) {
  return hash(password, options);
}

export async function verifyPassword(passwordHash: string, password: string) {
  try {
    return await verify(passwordHash, password, options);
  } catch {
    return false;
  }
}
