// Chương 6: hash password bằng Argon2id (package `argon2`), kèm needsRehash.
import argon2 from "argon2";
import { timingSafeEqual, createHash } from "node:crypto";

// OWASP Password Storage Cheat Sheet: m=19 MiB, t=2, p=1 là sàn. Đo lại trên server thật.
export const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19456, // KiB
  timeCost: 2,
  parallelism: 1,
} as const;

export const hashPassword = (plain: string): Promise<string> => argon2.hash(plain, ARGON2_OPTIONS);

// Trả về { ok, newHash? }; newHash có giá trị khi hash cũ cần nâng parameter (di trú dần khi login).
export async function verifyPassword(stored: string, plain: string): Promise<{ ok: boolean; newHash?: string }> {
  if (!(await argon2.verify(stored, plain))) return { ok: false };
  if (argon2.needsRehash(stored, ARGON2_OPTIONS)) return { ok: true, newHash: await hashPassword(plain) };
  return { ok: true };
}

// So sánh chuỗi bí mật (token, HMAC) không rò timing: hash về độ dài cố định rồi timingSafeEqual.
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}
