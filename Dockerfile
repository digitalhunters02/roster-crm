# Multi-stage build: compile the React client, then run the Express server,
# which serves client/dist and the /api routes on one port.
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci --ignore-scripts
COPY client client
RUN npm run build -w client

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production PORT=10000
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci --omit=dev --ignore-scripts -w server
COPY server server
COPY --from=build /app/client/dist client/dist
EXPOSE 10000
# seed.js creates the schema and only loads data into an empty database, so it is safe on every boot.
CMD ["sh", "-c", "node server/src/seed.js && node server/src/index.js"]
