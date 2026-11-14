import { buildServer } from "./app.js";

if (process.argv.includes("--healthcheck")) {
  // Used by Docker HEALTHCHECK: no curl in the image.
  try {
    const r = await fetch("http://127.0.0.1:8080/healthz", { signal: AbortSignal.timeout(2000) });
    process.exit(r.ok ? 0 : 1);
  } catch {
    process.exit(1);
  }
}

const server = buildServer();
server.listen(8080, () => console.log("listening :8080"));

let closing = false;
function shutdown(signal: string): void {
  if (closing) return;
  closing = true;
  console.log(`${signal} received, draining`);
  // close() stops accepting and waits for in-flight requests to finish.
  server.close(() => {
    console.log("shutdown complete");
    process.exit(0);
  });
  server.closeIdleConnections(); // drop idle keep-alive sockets so close() can finish
  setTimeout(() => process.exit(1), 25_000).unref(); // hard deadline below terminationGracePeriodSeconds
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
