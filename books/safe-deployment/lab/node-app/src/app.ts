import { createServer, type Server } from "node:http";
import { setTimeout as sleep } from "node:timers/promises";

const version = process.env.APP_VERSION ?? "dev";

export function buildServer(): Server {
  return createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    res.setHeader("Content-Type", "application/json");
    if (url.pathname === "/healthz") {
      res.end(JSON.stringify({ status: "ok", version, node: process.version, uid: process.getuid?.() }));
    } else if (url.pathname === "/slow") {
      // Simulates an in-flight request for the graceful shutdown lab.
      const ms = Number(url.searchParams.get("ms") ?? 1000);
      await sleep(ms);
      res.end(JSON.stringify({ done: `after ${ms}ms` }));
    } else {
      res.end(JSON.stringify({ hello: "bookcheck-deploy", version }));
    }
  });
}
