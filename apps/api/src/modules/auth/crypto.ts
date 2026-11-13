import { createHash, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { hash, verify } from '@node-rs/argon2';

/** Jeton opaque à forte entropie (256 bits), encodé pour une URL. */
export function generateOpaqueToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Empreinte stockée en base à la place du jeton. SHA-256 simple suffit : le
 * jeton est aléatoire (256 bits), pas un secret choisi par un humain.
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

// Paramètres Argon2id recommandés par l'OWASP (19 MiB, 2 itérations, 1 thread).
const ARGON2_OPTIONS = {
  // 2 = Algorithm.Argon2id (enum `const` ambiant, inaccessible avec isolatedModules).
  algorithm: 2,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

@Injectable()
export class PasswordService {
  private dummyHash?: Promise<string>;

  hash(password: string): Promise<string> {
    return hash(password, ARGON2_OPTIONS);
  }

  async verify(passwordHash: string, password: string): Promise<boolean> {
    try {
      return await verify(passwordHash, password);
    } catch {
      return false;
    }
  }

  /**
   * Vérification factice exécutée quand le compte n'existe pas, pour que le
   * temps de réponse ne révèle pas l'existence d'un e-mail.
   */
  async verifyDummy(password: string): Promise<void> {
    this.dummyHash ??= this.hash(generateOpaqueToken());
    await this.verify(await this.dummyHash, password);
  }
}
