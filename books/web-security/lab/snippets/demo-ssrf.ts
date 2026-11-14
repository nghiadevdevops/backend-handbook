// Chạy thật ssrf.ts: server nội bộ trên 127.0.0.1, thử chạm vào nó qua safeFetch.
import { createServer } from "node:http";
import { isBlockedIp, safeFetch } from "./ssrf.ts";

const internal = createServer((_q, res) => res.end("INTERNAL-SECRET")).listen(9099, "127.0.0.1");
await new Promise((r) => internal.once("listening", r));

for (const ip of ["127.0.0.1", "10.1.2.3", "169.254.169.254", "172.20.0.5", "::1", "::ffff:127.0.0.1", "fd00::1", "93.184.216.34"]) {
  console.log(`isBlockedIp(${ip}) =`, isBlockedIp(ip));
}

const cases: [string, string][] = [
  ["host allowlist, trỏ vào loopback", "http://localhost:9099/"],
  ["IP số thập phân (2130706433)", "http://2130706433:9099/"],
  ["IP literal 127.0.0.1", "http://127.0.0.1:9099/"],
  ["host ngoài allowlist", "http://evil.example/"],
  ["scheme file:", "file:///etc/passwd"],
];
const allow = new Set(["localhost", "127.0.0.1", "evil-not-listed.example"]);
for (const [label, url] of cases) {
  try { console.log(label, "=> ALLOWED", await safeFetch(url, allow)); }
  catch (e) { const err = e as Error & { cause?: Error }; console.log(label, "=> blocked:", err.cause?.message ?? err.message); }
}
internal.close();
