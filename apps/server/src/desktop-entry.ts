import { startOfficeServer } from "./server.ts";

async function main(): Promise<void> {
  const server = await startOfficeServer({
    port: Number(process.env.OFFICE_PORT ?? 0),
    ...(process.env.OFFICE_DB ? { dbPath: process.env.OFFICE_DB } : {}),
    ...(process.env.OFFICE_STATIC_ROOT ? { staticRoot: process.env.OFFICE_STATIC_ROOT } : {}),
  });

  const shutdown = async (): Promise<void> => {
    try {
      await server.close();
      process.exit(0);
    } catch (err) {
      console.error(err);
      process.exit(1);
    }
  };

  process.once("SIGINT", () => {
    void shutdown();
  });
  process.once("SIGTERM", () => {
    void shutdown();
  });

  console.log(
    `VIRTUAL_OFFICE_READY ${JSON.stringify({
      url: server.url,
      port: server.port,
      token: server.token,
    })}`
  );
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
