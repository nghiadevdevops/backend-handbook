import { test } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { buildServer } from "./app.js";

test("GET /healthz returns ok", async () => {
  const server = buildServer().listen(0);
  const { port } = server.address() as AddressInfo;
  const body = (await (await fetch(`http://127.0.0.1:${port}/healthz`)).json()) as { status: string };
  assert.equal(body.status, "ok");
  server.close();
  server.closeAllConnections();
});
