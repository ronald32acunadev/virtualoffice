import { randomBytes, timingSafeEqual } from "node:crypto";

/** A fresh random token per launch (32 bytes, hex). */
export function createToken(): string {
  return randomBytes(32).toString("hex");
}

export function tokensMatch(expected: string, provided: string | undefined): boolean {
  if (!provided) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function allowedHosts(port: number): string[] {
  return [`127.0.0.1:${port}`, `localhost:${port}`];
}

export function allowedOrigins(port: number, devOrigin?: string): string[] {
  const origins = [`http://127.0.0.1:${port}`, `http://localhost:${port}`];
  if (devOrigin) origins.push(devOrigin);
  return origins;
}
