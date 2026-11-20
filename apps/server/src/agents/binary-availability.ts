import fs from "node:fs";
import path from "node:path";

/** Checks synchronously whether `command` resolves to an executable file in `envPath` (or `process.env.PATH`). */
export function isBinaryAvailable(command: string, envPath?: string): boolean {
  if (!command) return false;

  const isExecutableFile = (candidate: string): boolean => {
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return fs.statSync(candidate).isFile();
    } catch {
      return false;
    }
  };

  if (path.isAbsolute(command) || command.includes(path.sep)) {
    return isExecutableFile(command);
  }

  const rawPath = envPath ?? process.env.PATH ?? "";
  for (const dir of rawPath.split(path.delimiter)) {
    if (!dir) continue;
    if (isExecutableFile(path.join(dir, command))) return true;
  }
  return false;
}
