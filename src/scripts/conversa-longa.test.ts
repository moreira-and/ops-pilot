import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import test from "node:test";
import { promisify } from "node:util";

const run = promisify(execFile);

test("conversa-longa.sh prints promptTokens, n/a and errors per turn", async (t) => {
  let call = 0;
  const seen: Array<string | undefined> = [];
  const server = createServer((request, response) => {
    let raw = "";
    request.on("data", (chunk) => { raw += chunk; });
    request.on("end", () => {
      seen.push(JSON.parse(raw).conversationId);
      call += 1;
      if (call === 3) {
        response.writeHead(500).end("{}");
        return;
      }
      const metrics = call === 1 ? { promptTokens: 321 } : {};
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ conversationId: "c-1", metrics }));
    });
  });
  server.listen(0);
  await once(server, "listening");
  t.after(() => server.close());
  const { port } = server.address() as { port: number };

  const { stdout } = await run("./conversa-longa.sh", [], {
    env: { ...process.env, BASE_URL: `http://127.0.0.1:${port}`, TURNS: "3" },
  });

  assert.deepEqual(stdout.trim().split("\n"), [
    "turno 1 promptTokens=321",
    "turno 2 promptTokens=n/a",
    "turno 3 erro=500",
  ]);
  assert.deepEqual(seen, [undefined, "c-1", "c-1"]);
});
