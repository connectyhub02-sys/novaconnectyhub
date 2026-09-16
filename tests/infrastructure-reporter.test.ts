import { createServer, type IncomingMessage } from "node:http";
import { execFile } from "node:child_process";
import { mkdtemp, writeFile, unlink, rmdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { expect, it } from "vitest";
const run = promisify(execFile);
async function withReporter(statuses: number[]) {
  const directory = await mkdtemp(join(tmpdir(), "connectyhub-infra-test-"));
  const file = join(directory, "event.json");
  const body = JSON.stringify({ kind: "deploy", sequence: 1 });
  await writeFile(file, body);
  const seen: { body: string; url: string; auth: string }[] = [];
  const server = createServer(async (req: IncomingMessage, res) => {
    let received = "";
    for await (const chunk of req) received += chunk;
    seen.push({ body: received, url: req.url ?? "", auth: req.headers.authorization ?? "" });
    const status = statuses[seen.length - 1] ?? 200;
    res.writeHead(status, status === 302 ? { Location: "http://127.0.0.1:1/never-follow" } : {});
    res.end("PRIVATE_RESPONSE_DO_NOT_LOG");
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Local server failed");
  let output = "", failed = false;
  try {
    const result = await run(process.execPath, [resolve("scripts/infra-report.mjs"), file], { env: { ...process.env, INFRA_REPORT_URL: `http://127.0.0.1:${address.port}`, INFRA_REPORT_PROJECT: "betel", INFRA_REPORT_TOKEN: "z".repeat(40) } });
    output = result.stdout + result.stderr;
  } catch (error) {
    failed = true;
    const e = error as { stdout: string; stderr: string };
    output = e.stdout + e.stderr;
  } finally {
    await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve()));
    await unlink(file); await rmdir(directory);
  }
  return { output, failed, seen, body };
}
it("retries transient errors with an identical event and never prints credentials or response bodies", async () => {
  const result = await withReporter([503, 200]);
  expect(result.failed).toBe(false);
  expect(result.seen).toHaveLength(2);
  expect(result.seen.every(r => r.body === result.body && r.url === "/api/infrastructure/betel/events" && r.auth === `Bearer ${"z".repeat(40)}`)).toBe(true);
  expect(result.output).not.toContain("PRIVATE_RESPONSE_DO_NOT_LOG");
  expect(result.output).not.toContain("z".repeat(40));
});
it("stops on permission rejection without retrying or dumping the payload", async () => {
  const result = await withReporter([403]);
  expect(result.failed).toBe(true);
  expect(result.seen).toHaveLength(1);
  expect(result.output).not.toContain(result.body);
  expect(result.output).not.toContain("PRIVATE_RESPONSE_DO_NOT_LOG");
});
