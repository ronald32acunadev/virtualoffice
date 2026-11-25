# Virtual Office — Project Rules

## Docker Test Deployment Workflow (Mandatory)

- Whenever a new test version is created or any code change is finished in this repository:
  1. Run verification (`npm run typecheck`, `npm test`).
  2. Rebuild and update the local Docker container:
     ```bash
     docker compose up -d --build --force-recreate
     ```
  3. Read the running URL (including the session token) from container logs:
     ```bash
     docker logs virtualoffice 2>&1 | grep "Virtual Office:" | tail -n 1
     ```
  4. Share the updated `/workspace` and `/office` URLs with the user.
- Do not leave a competing bare-metal server bound to port `4317` when the Docker container is running.
