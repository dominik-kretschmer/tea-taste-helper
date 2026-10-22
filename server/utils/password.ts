import { randomInt } from 'node:crypto'
import { hash, verify, type Algorithm, type Options } from '@node-rs/argon2'

// Argon2id mit den OWASP-Mindestwerten (19 MiB, 2 Durchläufe, 1 Thread).
// `Algorithm` ist ein const enum ohne Laufzeitwert, daher die Zahl: 2 = Argon2id.
const ARGON2_OPTIONS: Options = {
  algorithm: 2 as Algorithm,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
}

export function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTIONS)
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password)
  }
  catch {
    // Kaputter oder fremder Hash zählt als falsches Passwort
    return false
  }
}

let dummyHash: Promise<string> | undefined

/**
 * Prüft gegen einen Wegwerf-Hash, damit ein Login mit unbekannter E-Mail genauso lange dauert
 * wie einer mit falschem Passwort (AK-2.2). Ergebnis ist immer false.
 */
export async function verifyDummy(password: string): Promise<false> {
  dummyHash ??= hashPassword(`dummy-${randomInt(2 ** 32)}`)
  await verifyPassword(await dummyHash, password)
  return false
}

// Ohne leicht verwechselbare Zeichen (0/O, 1/l/I), damit Admins es fehlerfrei weitergeben können.
const TEMP_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
const TEMP_LENGTH = 18

/** Zufälliges Einmal-Passwort für den Admin-Reset (AK-6.1). */
export function generateTemporaryPassword(): string {
  return Array.from({ length: TEMP_LENGTH }, () => TEMP_ALPHABET[randomInt(TEMP_ALPHABET.length)]).join('')
}
