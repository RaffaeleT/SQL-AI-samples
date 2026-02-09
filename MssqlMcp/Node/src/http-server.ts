#!/usr/bin/env node

/**
 * HTTP SSE Wrapper for MSSQL MCP Server
 *
 * This wrapper exposes the MCP server over HTTP using Server-Sent Events (SSE).
 * It allows network clients to connect to the MCP server instead of using stdio.
 *
 * TODO (Future Security Enhancements):
 * - Add token-based authentication
 * - Integrate with Active Directory
 * - Add HTTPS support with SSL certificates
 * - Implement audit logging for queries and access
 * - Add firewall rules and IP whitelisting
 */

import * as dotenv from "dotenv";
import { createServer, IncomingMessage, ServerResponse } from "http";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import sql from "mssql";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { readdir, readFile } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

// Internal imports
import { UpdateDataTool } from "./tools/UpdateDataTool.js";
import { InsertDataTool } from "./tools/InsertDataTool.js";
import { ReadDataTool } from "./tools/ReadDataTool.js";
import { CreateTableTool } from "./tools/CreateTableTool.js";
import { CreateIndexTool } from "./tools/CreateIndexTool.js";
import { ListTableTool } from "./tools/ListTableTool.js";
import { DropTableTool } from "./tools/DropTableTool.js";
import { InteractiveBrowserCredential } from "@azure/identity";
import { DescribeTableTool } from "./tools/DescribeTableTool.js";

// Load environment variables
dotenv.config();

// Configuration
const HTTP_PORT = parseInt(process.env.HTTP_PORT || "3000", 10);
const HTTP_HOST = process.env.HTTP_HOST || "0.0.0.0";

// Globals for connection and token reuse
let globalSqlPool: sql.ConnectionPool | null = null;
let globalAccessToken: string | null = null;
let globalTokenExpiresOn: Date | null = null;

// For windows-integrated auth, we need the msnodesqlv8 variant of the mssql module.
let sqlConnect: typeof sql | null = null;
async function getSqlModule(): Promise<typeof sql> {
  if (sqlConnect) return sqlConnect;
  const authMethod = process.env.AUTH_METHOD?.toLowerCase() || 'azure-ad';
  if (authMethod === 'windows-integrated') {
    const mod = await import("mssql/msnodesqlv8.js");
    sqlConnect = mod.default;
  } else {
    sqlConnect = sql;
  }
  return sqlConnect;
}

// Export function to get the global SQL pool
export function getSqlPool(): sql.ConnectionPool {
  if (!globalSqlPool || !globalSqlPool.connected) {
    throw new Error('SQL connection pool is not initialized or not connected');
  }
  return globalSqlPool;
}

// Get the authentication method from environment variable
const authMethod = process.env.AUTH_METHOD?.toLowerCase() || 'azure-ad';

// Function to create SQL config based on authentication method
export async function createSqlConfig(): Promise<{ config: sql.config, token: string | null, expiresOn: Date | null }> {
  const trustServerCertificate = process.env.TRUST_SERVER_CERTIFICATE?.toLowerCase() === 'true';
  const connectionTimeout = process.env.CONNECTION_TIMEOUT ? parseInt(process.env.CONNECTION_TIMEOUT, 10) : 30;

  const baseConfig = {
    server: process.env.SERVER_NAME!,
    database: process.env.DATABASE_NAME!,
    options: {
      encrypt: authMethod === 'azure-ad',
      trustServerCertificate
    },
    connectionTimeout: connectionTimeout * 1000,
  };

  switch (authMethod) {
    case 'sql': {
      const username = process.env.SQL_USERNAME;
      const password = process.env.SQL_PASSWORD;

      if (!username || !password) {
        throw new Error('SQL_USERNAME and SQL_PASSWORD environment variables are required for SQL authentication');
      }

      return {
        config: {
          ...baseConfig,
          user: username,
          password: password,
          options: {
            ...baseConfig.options,
            encrypt: process.env.ENCRYPT?.toLowerCase() === 'true',
          },
        },
        token: null,
        expiresOn: null
      };
    }

    case 'windows': {
      return {
        config: {
          ...baseConfig,
          options: {
            ...baseConfig.options,
            encrypt: process.env.ENCRYPT?.toLowerCase() === 'true',
          },
          authentication: {
            type: 'ntlm',
            options: {
              domain: process.env.DOMAIN || '',
              userName: process.env.USERNAME || '',
              password: process.env.PASSWORD || '',
            },
          },
        },
        token: null,
        expiresOn: null
      };
    }

    case 'windows-integrated': {
      const encrypt = process.env.ENCRYPT?.toLowerCase() === 'true';
      const connectionString = `Driver={ODBC Driver 17 for SQL Server};Server=${process.env.SERVER_NAME};Database=${process.env.DATABASE_NAME};Trusted_Connection=Yes;Encrypt=${encrypt ? 'yes' : 'no'};TrustServerCertificate=${trustServerCertificate ? 'yes' : 'no'};Connection Timeout=${connectionTimeout};`;

      return {
        config: {
          connectionString: connectionString,
        } as unknown as sql.config,
        token: null,
        expiresOn: null
      };
    }

    case 'azure-ad':
    default: {
      const credential = new InteractiveBrowserCredential({
        redirectUri: 'http://localhost'
      });
      const accessToken = await credential.getToken('https://database.windows.net/.default');

      return {
        config: {
          ...baseConfig,
          options: {
            ...baseConfig.options,
            encrypt: true,
          },
          authentication: {
            type: 'azure-active-directory-access-token',
            options: {
              token: accessToken?.token!,
            },
          },
        },
        token: accessToken?.token!,
        expiresOn: accessToken?.expiresOnTimestamp ? new Date(accessToken.expiresOnTimestamp) : new Date(Date.now() + 30 * 60 * 1000)
      };
    }
  }
}

// Initialize tools
const updateDataTool = new UpdateDataTool();
const insertDataTool = new InsertDataTool();
const readDataTool = new ReadDataTool();
const createTableTool = new CreateTableTool();
const createIndexTool = new CreateIndexTool();
const listTableTool = new ListTableTool();
const dropTableTool = new DropTableTool();
const describeTableTool = new DescribeTableTool();

// Get the directory path for the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Prompt discovery utilities
interface PromptInfo {
  name: string;
  description: string;
  filePath: string;
}

async function discoverPrompts(): Promise<PromptInfo[]> {
  try {
    const promptsDir = join(__dirname, "..", "prompts");
    const files = await readdir(promptsDir);

    const prompts: PromptInfo[] = [];

    for (const file of files) {
      const match = file.match(/^prompt-(.+)\.md$/);
      if (match) {
        const name = match[1];
        const filePath = join(promptsDir, file);

        try {
          const content = await readFile(filePath, "utf-8");
          const description = extractDescription(content);

          prompts.push({
            name,
            description,
            filePath,
          });
        } catch (error) {
          console.error(`Error reading prompt file ${file}:`, error);
        }
      }
    }

    return prompts;
  } catch (error) {
    console.error("Error discovering prompts:", error);
    return [];
  }
}

function extractDescription(content: string): string {
  const descriptionMatch = content.match(/^Description:\s*(.+)$/m) ||
                          content.match(/^##?\s*Description\s*\n+(.+)$/m);

  if (descriptionMatch && descriptionMatch[1]) {
    return descriptionMatch[1].trim();
  }

  const lines = content.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      return trimmed;
    }
  }

  return "No description provided";
}

// Read READONLY env variable
const isReadOnly = process.env.READONLY === "true";

// Connect to SQL
async function ensureSqlConnection() {
  if (authMethod !== 'azure-ad') {
    if (globalSqlPool && globalSqlPool.connected) {
      return;
    }
  } else {
    if (
      globalSqlPool &&
      globalSqlPool.connected &&
      globalAccessToken &&
      globalTokenExpiresOn &&
      globalTokenExpiresOn > new Date(Date.now() + 2 * 60 * 1000)
    ) {
      return;
    }
  }

  const { config, token, expiresOn } = await createSqlConfig();
  globalAccessToken = token;
  globalTokenExpiresOn = expiresOn;

  if (globalSqlPool && globalSqlPool.connected) {
    await globalSqlPool.close();
  }

  const sqlMod = await getSqlModule();
  globalSqlPool = await sqlMod.connect(config);
}

// Patch all tool handlers to ensure SQL connection before running
function wrapToolRun(tool: { run: (...args: any[]) => Promise<any> }) {
  const originalRun = tool.run.bind(tool);
  tool.run = async function (...args: any[]) {
    await ensureSqlConnection();
    return originalRun(...args);
  };
}

[insertDataTool, readDataTool, updateDataTool, createTableTool, createIndexTool, dropTableTool, listTableTool, describeTableTool].forEach(wrapToolRun);

// Create MCP server instance factory
function createMCPServer(): Server {
  const server = new Server(
    {
      name: "mssql-mcp-server",
      version: "0.1.0",
    },
    {
      capabilities: {
        tools: {},
        prompts: {},
      },
    },
  );

  // Request handlers
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: isReadOnly
      ? [listTableTool, readDataTool, describeTableTool]
      : [insertDataTool, readDataTool, describeTableTool, updateDataTool, createTableTool, createIndexTool, dropTableTool, listTableTool],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
      let result;
      switch (name) {
        case insertDataTool.name:
          result = await insertDataTool.run(args);
          break;
        case readDataTool.name:
          result = await readDataTool.run(args);
          break;
        case updateDataTool.name:
          result = await updateDataTool.run(args);
          break;
        case createTableTool.name:
          result = await createTableTool.run(args);
          break;
        case createIndexTool.name:
          result = await createIndexTool.run(args);
          break;
        case listTableTool.name:
          result = await listTableTool.run(args);
          break;
        case dropTableTool.name:
          result = await dropTableTool.run(args);
          break;
        case describeTableTool.name:
          if (!args || typeof args.tableName !== "string") {
            return {
              content: [{ type: "text", text: `Missing or invalid 'tableName' argument for describe_table tool.` }],
              isError: true,
            };
          }
          result = await describeTableTool.run(args as { tableName: string });
          break;
        default:
          return {
            content: [{ type: "text", text: `Unknown tool: ${name}` }],
            isError: true,
          };
      }
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error occurred: ${error}` }],
        isError: true,
      };
    }
  });

  // Prompt handlers
  server.setRequestHandler(ListPromptsRequestSchema, async () => {
    const prompts = await discoverPrompts();
    return {
      prompts: prompts.map(p => ({
        name: p.name,
        description: p.description,
      })),
    };
  });

  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    const { name } = request.params;
    const prompts = await discoverPrompts();
    const prompt = prompts.find(p => p.name === name);

    if (!prompt) {
      throw new Error(`Unknown prompt: ${name}`);
    }

    try {
      const content = await readFile(prompt.filePath, "utf-8");
      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: content,
            },
          },
        ],
      };
    } catch (error) {
      throw new Error(`Error reading prompt file: ${error}`);
    }
  });

  return server;
}

// Track active connections
const activeConnections = new Map<string, { server: Server, transport: SSEServerTransport }>();

// HTTP server handler
async function handleRequest(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url || "/", `http://${req.headers.host}`);

  // CORS headers (adjust as needed for your network)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(200);
    res.end();
    return;
  }

  // Health check endpoint
  if (url.pathname === "/health" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      status: "ok",
      server: "mssql-mcp-server",
      version: "0.1.0",
      readonly: isReadOnly,
      authMethod: authMethod
    }));
    return;
  }

  // SSE endpoint for MCP
  if (url.pathname === "/sse" && req.method === "GET") {
    console.error(`[${new Date().toISOString()}] New SSE connection from ${req.socket.remoteAddress}`);

    const sessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const mcpServer = createMCPServer();
    const transport = new SSEServerTransport(url.pathname, res);

    activeConnections.set(sessionId, { server: mcpServer, transport });

    // Handle disconnection
    req.on("close", () => {
      console.error(`[${new Date().toISOString()}] SSE connection closed: ${sessionId}`);
      activeConnections.delete(sessionId);
    });

    try {
      await mcpServer.connect(transport);
      console.error(`[${new Date().toISOString()}] MCP server connected for session: ${sessionId}`);
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Error connecting MCP server:`, error);
      activeConnections.delete(sessionId);
    }
    return;
  }

  // Message endpoint for MCP (POST)
  if (url.pathname === "/message" && req.method === "POST") {
    let body = "";
    req.on("data", chunk => {
      body += chunk.toString();
    });

    req.on("end", async () => {
      try {
        // TODO: Route to appropriate session
        // For now, we'll use a simple implementation
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "received" }));
      } catch (error) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: String(error) }));
      }
    });
    return;
  }

  // Default: 404
  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("Not Found");
}

// Start HTTP server
async function startServer() {
  console.error("=".repeat(60));
  console.error("MSSQL MCP Server - HTTP SSE Wrapper");
  console.error("=".repeat(60));
  console.error(`Server Name: ${process.env.SERVER_NAME || 'Not configured'}`);
  console.error(`Database: ${process.env.DATABASE_NAME || 'Not configured'}`);
  console.error(`Auth Method: ${authMethod}`);
  console.error(`Read-Only Mode: ${isReadOnly}`);
  console.error(`HTTP Host: ${HTTP_HOST}`);
  console.error(`HTTP Port: ${HTTP_PORT}`);
  console.error("=".repeat(60));
  console.error("");
  console.error("TODO - Future Security Enhancements:");
  console.error("  - Add token-based authentication");
  console.error("  - Integrate with Active Directory");
  console.error("  - Add HTTPS support with SSL certificates");
  console.error("  - Implement audit logging for queries and access");
  console.error("  - Add firewall rules and IP whitelisting");
  console.error("=".repeat(60));
  console.error("");

  const httpServer = createServer(handleRequest);

  httpServer.listen(HTTP_PORT, HTTP_HOST, () => {
    console.error(`✓ HTTP SSE server listening on http://${HTTP_HOST}:${HTTP_PORT}`);
    console.error(`✓ Health check: http://${HTTP_HOST}:${HTTP_PORT}/health`);
    console.error(`✓ SSE endpoint: http://${HTTP_HOST}:${HTTP_PORT}/sse`);
    console.error("");
    console.error("Server is ready to accept connections.");
  });

  // Graceful shutdown
  process.on("SIGINT", async () => {
    console.error("\nShutting down server...");

    // Close all active connections
    for (const [sessionId, { server }] of activeConnections) {
      console.error(`Closing session: ${sessionId}`);
      await server.close();
    }
    activeConnections.clear();

    // Close SQL connection
    if (globalSqlPool) {
      await globalSqlPool.close();
    }

    httpServer.close(() => {
      console.error("Server stopped.");
      process.exit(0);
    });
  });
}

// Run the server
startServer().catch((error) => {
  console.error("Fatal error starting server:", error);
  process.exit(1);
});
