# The Park Day Companion server.
#
# Build from the REPO ROOT (the workspace lockfile lives there):
#
#   docker build -f apps/server/Dockerfile -t park-server .
#   docker run --rm -p 8787:8787 --env-file .env.local park-server
#
# ⚠️ Two stages, on purpose. The build stage has the whole toolchain; the image
# that runs has Node and one bundled file (esbuild inlines hono and the functions),
# so there is no node_modules in it at all — nothing to patch, nothing to leak.

FROM node:22-slim AS build
WORKDIR /repo
# Manifests first, so `npm ci` is cached until a dependency actually changes.
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY apps/server/package.json apps/server/
RUN npm ci --workspace apps/server --include-workspace-root=false --ignore-scripts
COPY apps/server apps/server
RUN npm -w apps/server run build

FROM node:22-slim
ENV NODE_ENV=production PORT=8787
WORKDIR /app
COPY --from=build /repo/apps/server/dist/server.mjs ./server.mjs
# ⚠️ Not root. The process needs no privileges, and a hole in it should not have them.
USER node
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=3s CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.mjs"]
