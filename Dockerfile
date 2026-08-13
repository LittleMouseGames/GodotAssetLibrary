# --- Builder stage: native deps (argon2) + webpack/template/SCSS build ---
FROM node:18-alpine AS builder

WORKDIR /app

COPY ["package.json", "package-lock.json*", "./"]

# argon2 0.27 has no Linux ARM64 musl prebuild, so node-gyp must compile it.
RUN apk add --no-cache python3 make g++ \
	&& npm ci

COPY . .

# Build, then drop dev-only packages so the runtime image is slim. The build
# must run before pruning because it needs TypeScript/Webpack/Sass.
RUN npm run build \
	&& npm prune --omit=dev

# --- Runtime stage: minimal, non-root ---
FROM node:18-alpine

ENV NODE_ENV=production
WORKDIR /app

# Only the compiled app and its production dependencies; the native argon2
# binary was compiled in the builder against the same Alpine base.
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

# Run as an unprivileged user. Sitemap generation writes
# dist/public/sitemap.xml at runtime, so that directory stays writable.
RUN mkdir -p /app/dist/public \
	&& chown -R node:node /app

USER node

EXPOSE 3000

CMD ["node", "dist/bundle.js"]
