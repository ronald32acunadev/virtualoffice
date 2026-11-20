import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export type DesktopServerHandle = {
  url: string;
  port: number;
  token: string;
  close: () => Promise<void>;
};

export type StartDesktopServerOptions = {
  repoRoot: string;
  dbPath: string;
  staticRoot: string;
};

const READY_PREFIX = "VIRTUAL_OFFICE_READY ";
const STARTUP_TIMEOUT_MS = 15_000;
const CLOSE_GRACE_MS = 5_000;

function parseReadyLine(line: string): { url: string; port: number; token: string } {
  const payload: unknown = JSON.parse(line.slice(READY_PREFIX.length));
  if (
    typeof payload !== "object" ||
    payload === null ||
    typeof (payload as Record<string, unknown>).url !== "string" ||
    typeof (payload as Record<string, unknown>).port !== "number" ||
    typeof (payload as Record<string, unknown>).token !== "string"
  ) {
    throw new Error("Invalid VIRTUAL_OFFICE_READY payload");
  }

  const record = payload as { url: string; port: number; token: string };
  return {
    url: record.url,
    port: record.port,
    token: record.token,
  };
}

export async function startDesktopServer(
  options: StartDesktopServerOptions
): Promise<DesktopServerHandle> {
  const { repoRoot, dbPath, staticRoot } = options;
  const binName = process.platform === "win32" ? "tsx.cmd" : "tsx";
  const localTsx = path.join(repoRoot, "node_modules", ".bin", binName);
  const tsxCommand = fs.existsSync(localTsx) ? localTsx : "tsx";
  const entryPath = path.join(repoRoot, "apps", "server", "src", "desktop-entry.ts");

  const child = spawn(tsxCommand, [entryPath], {
    cwd: repoRoot,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      OFFICE_PORT: "0",
      OFFICE_DB: dbPath,
      OFFICE_STATIC_ROOT: staticRoot,
    },
  });

  let exited = false;
  child.once("exit", () => {
    exited = true;
  });

  let closePromise: Promise<void> | null = null;
  const close = (): Promise<void> => {
    if (closePromise !== null) {
      return closePromise;
    }

    closePromise = new Promise<void>((resolve) => {
      if (exited || child.exitCode !== null || child.signalCode !== null) {
        resolve();
        return;
      }

      let killTimer: NodeJS.Timeout | null = null;
      const onExit = (): void => {
        if (killTimer !== null) {
          clearTimeout(killTimer);
          killTimer = null;
        }
        resolve();
      };

      child.once("exit", onExit);

      try {
        child.kill("SIGTERM");
      } catch {
        child.off("exit", onExit);
        resolve();
        return;
      }

      if (exited || child.exitCode !== null || child.signalCode !== null) {
        child.off("exit", onExit);
        onExit();
        return;
      }

      killTimer = setTimeout(() => {
        killTimer = null;
        if (!exited && child.exitCode === null && child.signalCode === null) {
          try {
            child.kill("SIGKILL");
          } catch {
            child.off("exit", onExit);
            resolve();
          }
        }
      }, CLOSE_GRACE_MS);
    });

    return closePromise;
  };

  const readyInfo = await new Promise<{ url: string; port: number; token: string }>(
    (resolve, reject) => {
      let settled = false;
      let stdoutBuffer = "";
      let stderrBuffer = "";

      const formatStderr = (): string => {
        const trimmed = stderrBuffer.trim();
        return trimmed.length > 0 ? `\nstderr: ${trimmed}` : "";
      };

      const cleanupStartup = (): void => {
        clearTimeout(startupTimer);
        child.off("error", onStartupError);
        child.off("exit", onStartupExit);
        child.stdout?.off("data", onStdoutData);
      };

      const failStartup = (err: Error): void => {
        if (settled) {
          return;
        }
        settled = true;
        cleanupStartup();
        reject(err);
      };

      const succeedStartup = (info: { url: string; port: number; token: string }): void => {
        if (settled) {
          return;
        }
        settled = true;
        cleanupStartup();
        resolve(info);
      };

      const startupTimer = setTimeout(() => {
        try {
          if (!exited && child.exitCode === null && child.signalCode === null) {
            child.kill("SIGTERM");
          }
        } catch {
          // Process already gone; proceed with timeout rejection.
        }
        failStartup(
          new Error(
            `Desktop server timed out after ${STARTUP_TIMEOUT_MS}ms${formatStderr()}`
          )
        );
      }, STARTUP_TIMEOUT_MS);

      const onStartupError = (err: Error): void => {
        failStartup(
          new Error(`Desktop server failed to start: ${err.message}${formatStderr()}`)
        );
      };

      const onStartupExit = (code: number | null, signal: NodeJS.Signals | null): void => {
        failStartup(
          new Error(
            `Desktop server exited prematurely (code=${String(code)}, signal=${String(signal)})${formatStderr()}`
          )
        );
      };

      const onStdoutData = (chunk: Buffer): void => {
        stdoutBuffer += chunk.toString("utf8");
        let newlineIndex = stdoutBuffer.indexOf("\n");
        while (newlineIndex !== -1) {
          const line = stdoutBuffer.slice(0, newlineIndex).replace(/\r$/, "");
          stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);

          if (line.startsWith(READY_PREFIX)) {
            try {
              const info = parseReadyLine(line);
              succeedStartup(info);
              return;
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err);
              try {
                if (!exited && child.exitCode === null && child.signalCode === null) {
                  child.kill("SIGTERM");
                }
              } catch {
                // Ignore kill error on invalid payload shutdown.
              }
              failStartup(new Error(`Invalid server ready output: ${message}${formatStderr()}`));
              return;
            }
          }

          newlineIndex = stdoutBuffer.indexOf("\n");
        }
      };

      child.stderr?.on("data", (chunk: Buffer) => {
        stderrBuffer += chunk.toString("utf8");
      });
      child.stdout?.on("data", onStdoutData);
      child.once("error", onStartupError);
      child.once("exit", onStartupExit);
    }
  );

  return {
    url: readyInfo.url,
    port: readyInfo.port,
    token: readyInfo.token,
    close,
  };
}
