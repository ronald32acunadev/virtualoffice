FROM node:24-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    git \
    g++ \
    make \
    python3 \
  && rm -rf /var/lib/apt/lists/*

# Install supported agent CLIs globally so mounted host credentials/configs work seamlessly
RUN npm install -g @anthropic-ai/claude-code @openai/codex

WORKDIR /app

COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/server/package.json ./apps/server/package.json
COPY apps/web/package.json ./apps/web/package.json

RUN npm ci

COPY apps ./apps

RUN npm run build

ENV OFFICE_HOST=0.0.0.0
ENV OFFICE_PORT=4317
ENV OFFICE_DB=/app/data/office.sqlite

EXPOSE 4317

CMD ["npm", "run", "start", "-w", "apps/server"]
