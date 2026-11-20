import fs from "node:fs";
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import websocket from "@fastify/websocket";
import fastifyStatic from "@fastify/static";
import type { OfficeService } from "../office/application/office-service.ts";
import type { OfficeRepository } from "../office/ports/office-repository.ts";
import { OfficeError } from "../office/domain/types.ts";
import { allowedHosts, allowedOrigins, tokensMatch } from "./security.ts";

export type BuildAppOptions = {
  token: string;
  port: number;
  repository: OfficeRepository;
  office: OfficeService;
  staticRoot?: string;
  devOrigin?: string;
};

const STATUS_BY_CODE: Record<OfficeError["code"], number> = {
  validation_error: 400,
  not_found: 404,
  boss_unavailable: 409,
  provider_on_break: 409,
  approval_not_pending: 409,
  working_directory_missing: 409,
  catalog_unavailable: 503,
};

function sendError(reply: FastifyReply, status: number, code: string, message: string, field?: string) {
  return reply.code(status).send({ error: { code, message, ...(field ? { field } : {}) } });
}

function isProtectedPath(pathname: string): boolean {
  return pathname === "/ws" || pathname === "/api" || pathname.startsWith("/api/");
}

function asRecord(body: unknown): Record<string, unknown> {
  return typeof body === "object" && body !== null && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
}

export async function buildApp(options: BuildAppOptions): Promise<FastifyInstance> {
  const { token, port, office, staticRoot, devOrigin } = options;
  const hosts = allowedHosts(port);
  const origins = allowedOrigins(port, devOrigin);

  const app = Fastify({ logger: false });

  app.addHook("onRequest", async (request: FastifyRequest, reply: FastifyReply) => {
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
      url.pathname === "/ws"
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

  if (staticRoot && fs.existsSync(staticRoot)) {
    await app.register(fastifyStatic, { root: staticRoot, prefix: "/" });
  }

  return app;
}
