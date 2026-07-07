# Bug 1: "npm ci --omit=dev" instalaba solo deps de producción y "npm run build"
# (nest build) fallaba porque @nestjs/cli es una devDependency. Fix: multi-stage build.
# ── Stage 1: build ──────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci
# Acá sí se instalan las devDependencies (incluye @nestjs/cli), necesarias para compilar

COPY . .
RUN npm run build

# ── Stage 2: runtime ────────────────────────────────────────────────────────
# Imagen final limpia: solo trae el resultado ya compilado (dist/), sin código
# fuente ni devDependencies — soluciona el Bug 1 sin perder una imagen liviana.
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist

EXPOSE 3000

CMD ["node", "dist/main.js"]
