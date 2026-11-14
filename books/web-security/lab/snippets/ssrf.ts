// Chương 10: chặn SSRF bằng cách kiểm tra IP ngay tại thời điểm kết nối (chống DNS rebinding).
import { lookup } from "node:dns";
import type { LookupAddress } from "node:dns";
import { BlockList, isIP } from "node:net";
import { Agent, fetch } from "undici";

const blocked = new BlockList();
for (const [addr, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8],
  ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.168.0.0", 16],
] as const) blocked.addSubnet(addr, prefix, "ipv4");
blocked.addAddress("::1", "ipv6");
blocked.addSubnet("fc00::", 7, "ipv6");   // unique local
blocked.addSubnet("fe80::", 10, "ipv6");  // link-local

export function isBlockedIp(ip: string): boolean {
  const v4 = ip.toLowerCase().startsWith("::ffff:") ? ip.slice(7) : ip; // IPv4-mapped IPv6
  return blocked.check(v4, isIP(v4) === 6 ? "ipv6" : "ipv4");
}

// Hàm lookup này là chỗ DUY NHẤT socket lấy địa chỉ, nên IP đã kiểm tra chính là IP được kết nối.
function guardedLookup(hostname: string, options: any, cb: (...a: any[]) => void): void {
  lookup(hostname, options, (err, address, family) => {
    if (err) return cb(err, address, family);
    const list: LookupAddress[] = Array.isArray(address) ? address : [{ address: address as string, family: family as number }];
    for (const a of list) if (isBlockedIp(a.address)) return cb(new Error(`blocked address ${a.address}`));
    cb(null, address, family);
  });
}

const agent = new Agent({ connect: { lookup: guardedLookup } });

export async function safeFetch(rawUrl: string, allowedHosts: ReadonlySet<string>): Promise<{ status: number; bytes: number }> {
  const url = new URL(rawUrl);                                      // chuẩn hóa: 2130706433 -> 127.0.0.1
  if (!["https:", "http:"].includes(url.protocol)) throw new Error("scheme not allowed");
  if (!allowedHosts.has(url.hostname)) throw new Error("host not in allowlist");
  // IP literal không đi qua lookup (socket kết nối thẳng), nên phải kiểm tra riêng ở đây
  const literal = url.hostname.replace(/^\[|\]$/g, ""); // bỏ [] của IPv6
  if (isIP(literal) && isBlockedIp(literal)) throw new Error(`blocked address ${literal}`);
  const res = await fetch(url, { dispatcher: agent, redirect: "manual", signal: AbortSignal.timeout(3000) });
  const body = await res.arrayBuffer();                             // thực tế: giới hạn kích thước khi đọc stream
  return { status: res.status, bytes: body.byteLength };
}
