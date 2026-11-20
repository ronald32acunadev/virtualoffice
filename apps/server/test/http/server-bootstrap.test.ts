import { describe, it, expect, afterEach } from "vitest";
import { startOfficeServer, type RunningOfficeServer } from "../../src/server.ts";

describe("startOfficeServer", () => {
  let server: RunningOfficeServer | null = null;

  afterEach(async () => {
    if (server) {
      await server.close();
      server = null;
    }
  });

  it("starts on an ephemeral port (port: 0) and serves authenticated state", async () => {
    server = await startOfficeServer({
      port: 0,
      dbPath: ":memory:",
      staticRoot: "/nonexistent-static-root",
    });

    expect(server.port).toBeGreaterThan(0);
    expect(server.token.length).toBeGreaterThanOrEqual(32);
    expect(server.url).toBe(`http://127.0.0.1:${server.port}/?token=${server.token}`);

    const res = await fetch(`http://127.0.0.1:${server.port}/api/state`, {
      headers: { authorization: `Bearer ${server.token}` },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("employees");
    expect(body).toHaveProperty("bosses");
  });

  it("close() is idempotent and releases the bound port", async () => {
    server = await startOfficeServer({
      port: 0,
      dbPath: ":memory:",
      staticRoot: "/nonexistent-static-root",
    });

    await Promise.all([server.close(), server.close()]);
    await server.close();

    await expect(
      fetch(`http://127.0.0.1:${server.port}/api/state`, {
        headers: { authorization: `Bearer ${server.token}` },
      }),
    ).rejects.toThrow();
  });
});
