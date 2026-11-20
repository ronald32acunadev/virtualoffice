import { startOfficeServer } from "./server.ts";

async function main() {
  const server = await startOfficeServer();

  console.log(`Virtual Office: ${server.url}`);

  const cleanup = async () => {
    await server.close();
    process.exit(0);
  };

  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
