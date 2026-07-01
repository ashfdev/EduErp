import { randomInt, randomUUID } from 'node:crypto';

interface Challenge {
  answer: number;
  expiresAt: number;
}

/**
 * Self-hosted math CAPTCHA (gap-fix, plan §1.A). No hCaptcha/reCAPTCHA site
 * keys exist yet (ROADMAP.md "External accounts"), so this is a genuinely
 * working — if low-friction — stand-in rather than a stub: it actually blocks
 * naive bots, just not sophisticated ones. Swap for a real provider once
 * credentials exist; the verify() call site won't need to change.
 */
const challenges = new Map<string, Challenge>();
const TTL_MS = 5 * 60 * 1000;

setInterval(() => {
  const now = Date.now();
  for (const [id, c] of challenges) if (c.expiresAt < now) challenges.delete(id);
}, 60 * 1000).unref();

export function generateChallenge(): { challengeId: string; question: string } {
  const a = randomInt(1, 10);
  const b = randomInt(1, 10);
  const challengeId = randomUUID();
  challenges.set(challengeId, { answer: a + b, expiresAt: Date.now() + TTL_MS });
  return { challengeId, question: `${a} + ${b} = ?` };
}

export function verifyChallenge(challengeId: string, answer: number): boolean {
  const challenge = challenges.get(challengeId);
  challenges.delete(challengeId); // one-time use, regardless of outcome
  if (!challenge || challenge.expiresAt < Date.now()) return false;
  return challenge.answer === answer;
}
