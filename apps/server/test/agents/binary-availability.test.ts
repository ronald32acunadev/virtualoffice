import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { isBinaryAvailable } from "../../src/agents/binary-availability.ts";

const tempDirs: string[] = [];

function makeDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vo-bin-test-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("isBinaryAvailable", () => {
  it("returns true when an executable file exists in envPath", () => {
    const dir = makeDir();
    const binPath = path.join(dir, "codex");
    fs.writeFileSync(binPath, "#!/bin/sh\nexit 0\n");
    fs.chmodSync(binPath, 0o755);

    expect(isBinaryAvailable("codex", dir)).toBe(true);
  });

  it("returns false when the binary is missing", () => {
    const dir = makeDir();
    expect(isBinaryAvailable("nonexistent-cli", dir)).toBe(false);
  });

  it("returns false when the file exists but is not executable", () => {
    const dir = makeDir();
    const filePath = path.join(dir, "codex");
    fs.writeFileSync(filePath, "not executable");
    fs.chmodSync(filePath, 0o644);

    if (process.getuid && process.getuid() !== 0) {
      expect(isBinaryAvailable("codex", dir)).toBe(false);
    }
  });

  it("returns false when the matching entry in envPath is a directory", () => {
    const dir = makeDir();
    const subDir = path.join(dir, "codex");
    fs.mkdirSync(subDir, { mode: 0o755 });

    expect(isBinaryAvailable("codex", dir)).toBe(false);
  });

  it("searches across multiple path-delimiter-separated directories", () => {
    const first = makeDir();
    const second = makeDir();
    const binPath = path.join(second, "gemini");
    fs.writeFileSync(binPath, "#!/bin/sh\nexit 0\n");
    fs.chmodSync(binPath, 0o755);

    const envPath = ["", first, second].join(path.delimiter);
    expect(isBinaryAvailable("gemini", envPath)).toBe(true);
  });

  it("returns false for empty command or empty envPath", () => {
    const dir = makeDir();
    expect(isBinaryAvailable("", dir)).toBe(false);
    expect(isBinaryAvailable("codex", "")).toBe(false);
  });
});
