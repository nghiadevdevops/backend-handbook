// Chương 13: security log có cấu trúc bằng pino, tự che field nhạy cảm bằng `redact`.
import pino from "pino";

export const secLog = pino({
  name: "security",
  timestamp: pino.stdTimeFunctions.isoTime,           // ISO 8601
  redact: { paths: ["password", "token", "req.headers.authorization", "req.headers.cookie", "*.card_number"], censor: "[REDACTED]" },
});

secLog.warn({
  event: "authz.denied",
  user_id: 1,
  action: "view",
  resource: "order:2",
  ip: "172.18.0.5",
  request_id: "req-123",
  req: { headers: { authorization: "Bearer tok-alice", "user-agent": "curl/8" } },
  token: "tok-alice",
}, "authorization denied");
