#!/usr/bin/env node

import * as dotenv from "dotenv";
import { createServer, IncomingMessage, ServerResponse } from "http";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { createMcpServer } from "./server-core.js";

dotenv.config();

const PORT = parseInt(process.env.HTTP_PORT || "3000", 10);
const HOST = process.env.HTTP_HOST || "0.0.0.0";

// Track active SSE sessions
const sessions = new Map<string, { server: Server; transport: SSEServerTransport }>();

function setCorsHeaders(res: ServerResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  setCorsHeaders(res);

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

  try {
    // GET /sse — Establish new SSE connection
    if (req.method === "GET" && url.pathname === "/sse") {
      const transport = new SSEServerTransport("/messages", res);
      const server = createMcpServer();

      sessions.set(transport.sessionId, { server, transport });
      console.error(`[SSE] New session: ${transport.sessionId} (active: ${sessions.size})`);

      transport.onclose = () => {
        sessions.delete(transport.sessionId);
        console.error(`[SSE] Session closed: ${transport.sessionId} (active: ${sessions.size})`);
      };

      await server.connect(transport);
      await transport.start();
      return;
    }

    // POST /messages?sessionId=xxx — Route message to session
    if (req.method === "POST" && url.pathname === "/messages") {
      const sessionId = url.searchParams.get("sessionId");

      if (!sessionId || !sessions.has(sessionId)) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Session not found" }));
        return;
      }

      const session = sessions.get(sessionId)!;
      await session.transport.handlePostMessage(req, res);
      return;
    }

    // GET /health — Health check
    if (req.method === "GET" && url.pathname === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        status: "ok",
        activeSessions: sessions.size,
        authMethod: process.env.AUTH_METHOD || "azure-ad",
        readonly: process.env.READONLY === "true",
      }));
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
  } catch (error) {
    console.error(`[SSE] Error handling ${req.method} ${url.pathname}:`, error);
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Internal server error" }));
    }
  }
});

httpServer.listen(PORT, HOST, () => {
  console.error(`MCP SSE server listening on http://${HOST}:${PORT}`);
  console.error(`  SSE endpoint:      GET  http://${HOST}:${PORT}/sse`);
  console.error(`  Messages endpoint: POST http://${HOST}:${PORT}/messages`);
  console.error(`  Health check:      GET  http://${HOST}:${PORT}/health`);
});
