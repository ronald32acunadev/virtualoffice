import fs from "node:fs";
import net from "node:net";
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import websocket from "@fastify/websocket";
import fastifyStatic from "@fastify/static";
import type { OfficeService } from "../office/application/office-service.ts";
import { ExternalLauncherService, LaunchError } from "../office/application/external-launcher.ts";
import type { OfficeRepository } from "../office/ports/office-repository.ts";
import { OfficeError } from "../office/domain/types.ts";
import { allowedHosts, allowedOrigins, tokensMatch } from "./security.ts";
import { TerminalError, type TerminalSession, type TerminalSessionManager } from "../terminal/terminal-session-manager.ts";
import { parseClientMessage, parseTerminalSize, type TerminalServerMessage } from "../terminal/terminal-protocol.ts";
import { DesktopError, type OpenCodeWebHost } from "../desktop/opencode-web-host.ts";
import { DESKTOP_APPS, type DesktopAppHost, type DesktopAppId } from "../desktop/desktop-app-host.ts";

export type BuildAppOptions = {
  token: string;
  port: number;
  repository: OfficeRepository;
  office: OfficeService;
  launcher?: ExternalLauncherService;
  staticRoot?: string;
  devOrigin?: string;
  terminals?: TerminalSessionManager;
  openCodeWeb?: OpenCodeWebHost;
  desktopApps?: DesktopAppHost;
};

const STATUS_BY_CODE: Record<OfficeError["code"], number> = {
  validation_error: 400,
  not_found: 404,
  boss_unavailable: 409,
  provider_on_break: 409,
  approval_not_pending: 409,
  working_directory_missing: 409,
  terminal_active: 409,
  catalog_unavailable: 503,
};

function sendError(reply: FastifyReply, status: number, code: string, message: string, field?: string) {
  return reply.code(status).send({ error: { code, message, ...(field ? { field } : {}) } });
}

function isProtectedPath(pathname: string): boolean {
  return pathname === "/ws" || pathname === "/api" || pathname.startsWith("/api/") || pathname.startsWith("/ws/");
}

function asRecord(body: unknown): Record<string, unknown> {
  return typeof body === "object" && body !== null && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
}

/** The desktop app embedded for a boss; OpenCode is embedded as its web UI instead. */
function desktopAppFor(bossId: string): DesktopAppId | undefined {
  switch (bossId) {
    case "claude":
      return "claude_desktop";
    case "codex":
      return "chatgpt";
    case "gemini":
      return "antigravity";
    default:
      return undefined;
  }
}

export async function buildApp(options: BuildAppOptions): Promise<FastifyInstance> {
  const { token, port, office, staticRoot, devOrigin, terminals, openCodeWeb, desktopApps } = options;
  const launcher = options.launcher ?? new ExternalLauncherService();

  const app = Fastify({ logger: false });

  const resolvePort = (): number => {
    if (port > 0) return port;
    const addr = app.server.address();
    return typeof addr === "object" && addr !== null ? addr.port : port;
  };

  app.addHook("onRequest", async (request: FastifyRequest, reply: FastifyReply) => {
    const activePort = resolvePort();
    const hosts = allowedHosts(activePort);
    const origins = allowedOrigins(activePort, devOrigin);

    // 1. Host check on every request, static files included.
    if (!request.headers.host || !hosts.includes(request.headers.host)) {
      return sendError(reply, 403, "forbidden_host", "Host not allowed");
    }
    const url = new URL(request.url, "http://office.local");
    if (!isProtectedPath(url.pathname)) return;

    // 2. Origin check (only when the header is present).
    const origin = request.headers.origin;
    if (origin !== undefined && !origins.includes(origin)) {
      return sendError(reply, 403, "forbidden_origin", "Origin not allowed");
    }
    // CORS preflight for the optional dev origin only; it never carries the token.
    if (request.method === "OPTIONS" && origin !== undefined && origin === devOrigin) {
      return reply
        .code(204)
        .header("access-control-allow-origin", origin)
        .header("access-control-allow-headers", "authorization, content-type")
        .header("access-control-allow-methods", "GET, POST, PATCH, OPTIONS")
        .send();
    }
    // 3. Token check.
    const provided =
      url.pathname === "/ws" || url.pathname.startsWith("/ws/")
        ? (url.searchParams.get("token") ?? undefined)
        : request.headers.authorization?.startsWith("Bearer ")
          ? request.headers.authorization.slice("Bearer ".length)
          : undefined;
    if (!tokensMatch(token, provided)) {
      return sendError(reply, 401, "unauthorized", "Missing or invalid token");
    }
    if (origin !== undefined && origin === devOrigin) {
      reply.header("access-control-allow-origin", origin);
    }
  });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof OfficeError) {
      return sendError(reply, STATUS_BY_CODE[error.code], error.code, error.message, error.field);
    }
    const status = (error as { statusCode?: number }).statusCode;
    if (typeof status === "number" && status >= 400 && status < 500) {
      return sendError(reply, 400, "validation_error", "Invalid request");
    }
    return sendError(reply, 500, "internal_error", "Internal error");
  });

  // Client routes (/office, /workspace, ...) are answered with index.html when the client is served.
  const serveClient = Boolean(staticRoot && fs.existsSync(staticRoot));
  app.setNotFoundHandler((request, reply) => {
    const pathname = new URL(request.url, "http://office.local").pathname;
    if (serveClient && request.method === "GET" && !isProtectedPath(pathname)) {
      return reply.sendFile("index.html");
    }
    return sendError(reply, 404, "not_found", "Not found");
  });

  await app.register(websocket);

  app.get("/api/state", async () => office.getState());

  app.get<{ Params: { id: string } }>("/api/employees/:id/messages", async (request) => ({
    messages: office.listMessages(request.params.id),
  }));

  app.post("/api/employees", async (request, reply) => {
    const body = asRecord(request.body);
    const employee = await office.hireFromRequest({
      bossId: body.bossId,
      task: body.task,
      workingDirectory: body.workingDirectory,
      name: body.name,
      species: body.species,
      role: body.role,
      jobTitle: body.jobTitle,
    });
    return reply.code(201).send({ employee });
  });

  app.get("/api/catalog", async (request) => {
    const query = asRecord(request.query);
    return { catalog: await office.getCatalog({ workingDirectory: query.workingDirectory, refresh: query.refresh }) };
  });

  app.get<{ Params: { id: string } }>("/api/employees/:id/catalog", async (request) => ({
    catalog: await office.getEmployeeCatalog(request.params.id, { refresh: asRecord(request.query).refresh }),
  }));

  app.patch<{ Params: { id: string } }>("/api/employees/:id", async (request) => {
    const body = asRecord(request.body);
    return {
      employee: office.updateProfile(request.params.id, {
        name: body.name,
        species: body.species,
        jobTitle: body.jobTitle,
      }),
    };
  });

  app.get("/api/imports/claude/sessions", async (request) => {
    const query = asRecord(request.query);
    return office.listClaudeSessions({ q: query.q, limit: query.limit, offset: query.offset });
  });

  app.post("/api/imports/claude", async (request) => office.importClaudeSessions(asRecord(request.body).sessionIds));

  app.post<{ Params: { id: string } }>("/api/employees/:id/messages", async (request, reply) => {
    const message = await office.sendMessage(request.params.id, asRecord(request.body).text);
    return reply.code(202).send({ message });
  });

  app.post<{ Params: { id: string } }>("/api/employees/:id/stop", async (request) => ({
    employee: await office.stop(request.params.id),
  }));

  app.get<{ Params: { id: string } }>("/api/employees/:id/launch-targets", async (request, reply) => {
    const employee = options.repository.getEmployee(request.params.id);
    if (!employee) {
      return sendError(reply, 404, "not_found", "Employee not found");
    }
    return { targets: launcher.listTargets(employee) };
  });

  app.post<{ Params: { id: string } }>("/api/employees/:id/launch", async (request, reply) => {
    const employee = options.repository.getEmployee(request.params.id);
    if (!employee) {
      return sendError(reply, 404, "not_found", "Employee not found");
    }
    const targetId = asRecord(request.body).targetId;
    if (typeof targetId !== "string" || targetId.trim() === "") {
      return sendError(reply, 400, "validation_error", "targetId is required", "targetId");
    }
    try {
      return launcher.launch(employee, targetId.trim());
    } catch (err) {
      if (err instanceof LaunchError) {
        return sendError(reply, err.status, err.code, err.message);
      }
      throw err;
    }
  });

  app.post<{ Params: { id: string } }>("/api/bosses/:id/resume", async (request) => ({
    boss: office.resumeBoss(request.params.id),
  }));

  app.post<{ Params: { id: string } }>("/api/approvals/:id/decision", async (request) => {
    const body = asRecord(request.body);
    return { approval: office.decide(request.params.id, { decision: body.decision, answers: body.answers }) };
  });

  app.get("/ws", { websocket: true }, (socket) => {
    const unsubscribe = office.subscribe((event) => {
      if (socket.readyState === 1) socket.send(JSON.stringify(event));
    });
    socket.on("close", unsubscribe);
    socket.on("error", unsubscribe);
  });

  app.get<{ Params: { employeeId: string }; Querystring: Record<string, unknown> }>(
    "/ws/terminal/:employeeId",
    { websocket: true },
    (socket, request) => {
      const send = (message: TerminalServerMessage) => {
        if (socket.readyState === 1) socket.send(JSON.stringify(message));
      };

      if (terminals === undefined) {
        send({ type: "error", code: "terminal_unavailable", message: "Embedded terminal is not enabled" });
        socket.close(1011, "terminal_unavailable");
        return;
      }

      let session: TerminalSession;
      try {
        session = terminals.open(request.params.employeeId, parseTerminalSize(request.query));
      } catch (err) {
        if (err instanceof TerminalError) {
          send({ type: "error", code: err.code, message: err.message });
          socket.close(1008, err.code);
        } else {
          send({ type: "error", code: "internal_error", message: "Internal error" });
          socket.close(1011, "internal_error");
        }
        return;
      }

      const scrollback = session.scrollback();
      if (scrollback !== "") {
        send({ type: "output", data: scrollback });
      }
      const offData = session.onData((data) => send({ type: "output", data }));
      const offExit = session.onExit((code) => {
        send({ type: "exit", code });
        socket.close(1000, "exit");
      });
      const cleanup = () => {
        offData();
        offExit();
      };
      socket.on("close", cleanup);
      socket.on("error", cleanup);
      socket.on("message", (raw: Buffer) => {
        const message = parseClientMessage(raw.toString());
        if (!message) return;
        if (message.type === "input") session.write(message.data);
        else if (message.type === "resize") session.resize(message.cols, message.rows);
        else if (message.type === "kill") session.kill();
      });
    },
  );

  app.get<{ Params: { appId: string } }>("/ws/desktop/:appId", { websocket: true }, (socket, request) => {
    const host = options.desktopApps;
    const appId = request.params.appId;
    const send = (message: { type: string; code: string; message: string }) => {
      if (socket.readyState === 1) socket.send(JSON.stringify(message));
    };
    if (host === undefined) {
      send({ type: "error", code: "desktop_unavailable", message: "Embedded desktop apps are not enabled" });
      socket.close(1011, "desktop_unavailable");
      return;
    }
    if (!Object.prototype.hasOwnProperty.call(DESKTOP_APPS, appId)) {
      send({ type: "error", code: "unknown_app", message: "Unknown desktop app" });
      socket.close(1008, "unknown_app");
      return;
    }
    const instance = host.get(appId as DesktopAppId);
    if (instance === undefined) {
      send({ type: "error", code: "app_not_running", message: "The desktop app is not running" });
      socket.close(1008, "app_not_running");
      return;
    }
    const tcp = net.connect({ host: "127.0.0.1", port: instance.rfbPort });
    let connected = false;
    const browserMessages: Array<Buffer> = [];
    const writeBrowserMessage = (buf: Buffer) => {
      if (connected) tcp.write(buf);
      else browserMessages.push(buf);
    };
    const sendTcpChunk = (chunk: Buffer) => {
      if (socket.readyState === 1) socket.send(chunk);
    };
    tcp.on("connect", () => {
      connected = true;
      for (const buf of browserMessages) tcp.write(buf);
      browserMessages.length = 0;
    });
    tcp.on("data", (chunk) => sendTcpChunk(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    tcp.on("close", () => {
      if (socket.readyState === 1) socket.close(1000, "display_closed");
    });
    tcp.on("error", () => {
      if (socket.readyState === 1) socket.close(1000, "display_closed");
    });
    socket.on("close", () => tcp.destroy());
    socket.on("error", () => tcp.destroy());
    socket.on("message", (raw) => {
      writeBrowserMessage(Array.isArray(raw) ? Buffer.concat(raw) : Buffer.isBuffer(raw) ? raw : Buffer.from(raw));
    });
  });

  if (staticRoot && fs.existsSync(staticRoot)) {
    await app.register(fastifyStatic, { root: staticRoot, prefix: "/" });
  }

  app.get<{ Params: { id: string } }>("/api/employees/:id/app", async (request, reply) => {
    const employee = options.repository.getEmployee(request.params.id);
    if (!employee) {
      return sendError(reply, 404, "not_found", "Employee not found");
    }
    if (employee.bossId === "opencode") {
      return { app: { kind: "web", running: openCodeWeb?.isRunning(employee.workingDirectory) ?? false, url: null } };
    }
    const appId = desktopAppFor(employee.bossId);
    if (appId === undefined) {
      return sendError(reply, 409, "app_not_available", "Embedded app is not available for this boss yet");
    }
    return { app: { kind: "vnc", appId, running: desktopApps?.get(appId) !== undefined } };
  });

  app.post<{ Params: { id: string } }>("/api/employees/:id/app/start", async (request, reply) => {
    const employee = options.repository.getEmployee(request.params.id);
    if (!employee) {
      return sendError(reply, 404, "not_found", "Employee not found");
    }
    if (employee.bossId === "opencode") {
      if (openCodeWeb === undefined) {
        return sendError(reply, 409, "app_not_available", "Embedded app is not enabled");
      }
      try {
        const webApp = await openCodeWeb.start(employee.workingDirectory);
        return reply.code(200).send({ app: { kind: "web", running: true, url: webApp.url } });
      } catch (err) {
        if (err instanceof DesktopError) {
          return sendError(reply, err.status, err.code, err.message);
        }
        throw err;
      }
    }
    const appId = desktopAppFor(employee.bossId);
    if (appId === undefined) {
      return sendError(reply, 409, "app_not_available", "Embedded app is not available for this boss yet");
    }
    if (desktopApps === undefined) {
      return sendError(reply, 409, "app_not_available", "Embedded app is not enabled");
    }
    try {
      await desktopApps.start(appId);
      return reply.code(200).send({ app: { kind: "vnc", appId, running: true } });
    } catch (err) {
      if (err instanceof DesktopError) {
        return sendError(reply, err.status, err.code, err.message);
      }
      throw err;
    }
  });

  app.post<{ Params: { id: string } }>("/api/employees/:id/app/stop", async (request, reply) => {
    const employee = options.repository.getEmployee(request.params.id);
    if (!employee) {
      return sendError(reply, 404, "not_found", "Employee not found");
    }
    if (employee.bossId === "opencode") {
      return { stopped: openCodeWeb?.stop(employee.workingDirectory) ?? false };
    }
    const appId = desktopAppFor(employee.bossId);
    if (appId === undefined) {
      return { stopped: false };
    }
    return { stopped: desktopApps?.stop(appId) ?? false };
  });

  app.post<{ Params: { id: string } }>("/api/employees/:id/app/relaunch", async (request, reply) => {
    const employee = options.repository.getEmployee(request.params.id);
    if (!employee) {
      return sendError(reply, 404, "not_found", "Employee not found");
    }
    const appId = employee.bossId === "opencode" ? undefined : desktopAppFor(employee.bossId);
    if (appId === undefined) {
      return { relaunched: false };
    }
    return { relaunched: desktopApps?.relaunch(appId) ?? false };
  });

  return app;
}
