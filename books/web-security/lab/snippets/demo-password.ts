// Chạy thật các hàm trong password.ts, in kết quả để dán vào chương 6.
import argon2 from "argon2";
import { hashPassword, verifyPassword, safeEqual, ARGON2_OPTIONS } from "./password.ts";

let t = performance.now();
const h = await hashPassword("correct horse battery staple");
console.log("hash:", h);
console.log("hash ms:", Math.round(performance.now() - t));
console.log("verify đúng:", (await verifyPassword(h, "correct horse battery staple")).ok);
console.log("verify sai:", (await verifyPassword(h, "wrong")).ok);

// hash cũ với parameter yếu hơn => needsRehash
const weak = await argon2.hash("pw", { ...ARGON2_OPTIONS, memoryCost: 4096, timeCost: 1 });
console.log("weak:", weak.slice(0, 40));
const r = await verifyPassword(weak, "pw");
console.log("weak verify ok:", r.ok, "| có newHash:", Boolean(r.newHash), "|", r.newHash?.slice(0, 40));
console.log("safeEqual:", safeEqual("abc", "abc"), safeEqual("abc", "abd"));
