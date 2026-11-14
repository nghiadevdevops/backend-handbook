// Chương 7: ký và verify JWT bằng `jose`, ghim algorithm, issuer, audience.
import { SignJWT, jwtVerify, generateSecret } from "jose";

const secret = await generateSecret("HS256"); // lab: sinh ngẫu nhiên; thực tế lấy từ secret store

export const signAccessToken = (sub: string): Promise<string> =>
  new SignJWT({ role: "user" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(sub)
    .setIssuer("https://shop.example")
    .setAudience("shop-api")
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(secret);

export async function verifyAccessToken(token: string) {
  const { payload } = await jwtVerify(token, secret, {
    algorithms: ["HS256"],           // ghim algorithm, không đọc từ header của token
    issuer: "https://shop.example",
    audience: "shop-api",
  });
  return payload;
}

// --- demo ---
const t = await signAccessToken("user-1");
console.log("verify ok:", (await verifyAccessToken(t)).sub);

// alg=none: attacker bỏ chữ ký
const [h, p] = t.split(".");
const none = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
try { await verifyAccessToken(`${none}.${p}.`); console.log("alg=none: ACCEPTED (lỗi!)"); }
catch (e) { console.log("alg=none rejected:", (e as Error).name); }

// token đúng cấu trúc nhưng ký bằng key khác
const other = await generateSecret("HS256");
const forged = await new SignJWT({ role: "admin" }).setProtectedHeader({ alg: "HS256" })
  .setSubject("user-1").setIssuer("https://shop.example").setAudience("shop-api").setExpirationTime("10m").sign(other);
try { await verifyAccessToken(forged); console.log("forged: ACCEPTED (lỗi!)"); }
catch (e) { console.log("forged rejected:", (e as Error).name); }

// sai audience
const wrongAud = await new SignJWT({}).setProtectedHeader({ alg: "HS256" })
  .setSubject("user-1").setIssuer("https://shop.example").setAudience("other-api").setExpirationTime("10m").sign(secret);
try { await verifyAccessToken(wrongAud); console.log("wrong aud: ACCEPTED (lỗi!)"); }
catch (e) { console.log("wrong aud rejected:", (e as Error).name); }
void h;
