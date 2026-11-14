// Client test cho MCP server qua stdio: liệt kê tool, gọi đúng đơn, đơn của tenant khác, mã sai. Không cần API key.
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import assert from "node:assert/strict";

const client = new Client({ name: "demo-client", version: "1.0.0" });
await client.connect(
  new StdioClientTransport({
    command: process.execPath,
    args: ["src/demoMcpServer.ts"],
    env: { ...process.env, SHOPASSIST_TENANT_ID: "1" } as Record<string, string>,
  }),
);

const tools = await client.listTools();
console.log("tools:", tools.tools.map((t) => t.name));
assert.deepEqual(tools.tools.map((t) => t.name), ["lookup_order"]);

const call = async (order_id: string) =>
  client.callTool({ name: "lookup_order", arguments: { order_id } });

const ok = await call("A1029");
console.log("A1029 ->", JSON.stringify(ok));
assert.ok(!ok.isError);

const other = await call("A2000"); // đơn của tenant 2
console.log("A2000 ->", JSON.stringify(other));
assert.ok(other.isError);

const bad = await call("xyz");
console.log("xyz ->", JSON.stringify(bad));
assert.ok(bad.isError);

await client.close();
console.log("MCP stdio test: OK");
