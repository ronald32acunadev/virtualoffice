import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  shell,
  type WindowOpenHandlerResponse,
} from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  startDesktopServer,
  type DesktopServerHandle,
} from "./server-bridge.js";
import {
  classifyWindowOpen,
  createShutdownGuard,
} from "./window-policy.js";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(currentDir, "../../..");
const preloadPath = path.join(currentDir, "preload.cjs");

let server: DesktopServerHandle | null = null;
let shutdownGuard: ReturnType<typeof createShutdownGuard> | null = null;

ipcMain.handle("desktop:pick-directory", async (event): Promise<string | null> => {
  const owner = BrowserWindow.fromWebContents(event.sender);
  const result = owner
    ? await dialog.showOpenDialog(owner, { properties: ["openDirectory"] })
    : await dialog.showOpenDialog({ properties: ["openDirectory"] });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  return result.filePaths[0] ?? null;
});

function attachWindowOpenHandler(win: BrowserWindow, serverOrigin: string): void {
  win.webContents.setWindowOpenHandler(({ url }): WindowOpenHandlerResponse => {
    const decision = classifyWindowOpen(url, serverOrigin);
    switch (decision.kind) {
      case "allow_office":
        return {
          action: "allow",
          overrideBrowserWindowOptions: {
            width: 1280,
            height: 840,
            title: "Virtual Office — 3D Office",
            webPreferences: {
              preload: preloadPath,
              contextIsolation: true,
              nodeIntegration: false,
              sandbox: true,
            },
          },
        };
      case "open_external":
        void shell.openExternal(decision.url);
        return { action: "deny" };
      case "deny":
        return { action: "deny" };
    }
  });
}

app
  .whenReady()
  .then(async () => {
    const dbPath =
      process.env.OFFICE_DB ?? path.join(app.getPath("userData"), "office.sqlite");
    const staticRoot = path.join(repoRoot, "apps", "web", "dist");

    server = await startDesktopServer({
      repoRoot,
      dbPath,
      staticRoot,
    });

    const runningServer = server;
    shutdownGuard = createShutdownGuard(() => runningServer.close());

    const serverOrigin = new URL(runningServer.url).origin;
    const mainWindow = new BrowserWindow({
      width: 1400,
      height: 900,
      title: "Virtual Office",
      webPreferences: {
        preload: preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });

    attachWindowOpenHandler(mainWindow, serverOrigin);
    await mainWindow.loadURL(
      `${serverOrigin}/workspace?token=${encodeURIComponent(runningServer.token)}`
    );
  })
  .catch((err: unknown) => {
    console.error("Failed to launch Virtual Office desktop:", err);
    app.exit(1);
  });

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", (event) => {
  if (shutdownGuard && !shutdownGuard.isDone()) {
    event.preventDefault();
    void shutdownGuard.run().finally(() => {
      app.exit(0);
    });
  }
});
