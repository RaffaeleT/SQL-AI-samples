#!/usr/bin/env node

// External imports
import * as dotenv from "dotenv";
import sql from "mssql";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { readdir, readFile } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

// For windows-integrated auth, we need the msnodesqlv8 variant of the mssql module.
// The standard 'mssql' import uses the tedious driver and ignores the 'driver' config property.
// We dynamically import 'mssql/msnodesqlv8' at connection time to use the native ODBC driver.
let sqlConnect: typeof sql | null = null;
async function getSqlModule(): Promise<typeof sql> {
  if (sqlConnect) return sqlConnect;
  if (authMethod === 'windows-integrated') {
    const mod = await import("mssql/msnodesqlv8.js");
    sqlConnect = mod.default;
  } else {
    sqlConnect = sql;
  }
  return sqlConnect;
}

// Internal imports
import { UpdateDataTool } from "./tools/UpdateDataTool.js";
import { InsertDataTool } from "./tools/InsertDataTool.js";
import { ReadDataTool } from "./tools/ReadDataTool.js";
import { CreateTableTool } from "./tools/CreateTableTool.js";
import { CreateIndexTool } from "./tools/CreateIndexTool.js";
import { ListTableTool } from "./tools/ListTableTool.js";
import { DropTableTool } from "./tools/DropTableTool.js";
import { DefaultAzureCredential, InteractiveBrowserCredential } from "@azure/identity";
import { DescribeTableTool } from "./tools/DescribeTableTool.js";

// MSSQL Database connection configuration
// const credential = new DefaultAzureCredential();

// Globals for connection and token reuse
let globalSqlPool: sql.ConnectionPool | null = null;
let globalAccessToken: string | null = null;
let globalTokenExpiresOn: Date | null = null;

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
      encrypt: authMethod === 'azure-ad', // Only encrypt for Azure AD by default
      trustServerCertificate
    },
    connectionTimeout: connectionTimeout * 1000, // convert seconds to milliseconds
  };

  switch (authMethod) {
    case 'sql': {
      // SQL Server Authentication (username/password)
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
            encrypt: process.env.ENCRYPT?.toLowerCase() === 'true', // Allow override for SQL auth
          },
        },
        token: null,
        expiresOn: null
      };
    }

    case 'windows': {
      // Windows Authentication (NTLM) with explicit credentials
      return {
        config: {
          ...baseConfig,
          options: {
            ...baseConfig.options,
            encrypt: process.env.ENCRYPT?.toLowerCase() === 'true', // Allow override for Windows auth
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
      // Windows Integrated Authentication - uses current Windows session credentials
      // No username/password required - authenticates as the logged-in Windows user
      // Requires msnodesqlv8 driver and SQL Server Native Client/ODBC Driver installed
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
      // Azure AD Authentication (Interactive Browser)
      const credential = new InteractiveBrowserCredential({
        redirectUri: 'http://localhost'
      });
      const accessToken = await credential.getToken('https://database.windows.net/.default');

      return {
        config: {
          ...baseConfig,
          options: {
            ...baseConfig.options,
            encrypt: true, // Always encrypt for Azure AD
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
      // Match files like: prompt-database-schema.md
      const match = file.match(/^prompt-(.+)\.md$/);
      if (match) {
        const name = match[1];
        const filePath = join(promptsDir, file);

        try {
          // Read the file to extract description
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
  // Look for a line starting with "Description:" or a "## Description" header
  const descriptionMatch = content.match(/^Description:\s*(.+)$/m) ||
                          content.match(/^##?\s*Description\s*\n+(.+)$/m);

  if (descriptionMatch && descriptionMatch[1]) {
    return descriptionMatch[1].trim();
  }

  // Fallback: use first non-empty line (after headers)
  const lines = content.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      return trimmed;
    }
  }

  return "No description provided";
}

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

// Read READONLY env variable
const isReadOnly = process.env.READONLY === "true";

// Request handlers

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: isReadOnly
    ? [listTableTool, readDataTool, describeTableTool] // todo: add searchDataTool to the list of tools available in readonly mode once implemented
    : [insertDataTool, readDataTool, describeTableTool, updateDataTool, createTableTool, createIndexTool, dropTableTool, listTableTool], // add all new tools here
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

// Server startup
async function runServer() {
  try {
    const transport = new StdioServerTransport();
    await server.connect(transport);
  } catch (error) {
    console.error("Fatal error running server:", error);
    process.exit(1);
  }
}

runServer().catch((error) => {
  console.error("Fatal error running server:", error);
  process.exit(1);
});

// Connect to SQL only when handling a request

async function ensureSqlConnection() {
  // For non-Azure AD auth, just check if we have a connected pool
  if (authMethod !== 'azure-ad') {
    if (globalSqlPool && globalSqlPool.connected) {
      return;
    }
  } else {
    // For Azure AD, also check token expiry
    if (
      globalSqlPool &&
      globalSqlPool.connected &&
      globalAccessToken &&
      globalTokenExpiresOn &&
      globalTokenExpiresOn > new Date(Date.now() + 2 * 60 * 1000) // 2 min buffer
    ) {
      return;
    }
  }

  // Get config (and token for Azure AD)
  const { config, token, expiresOn } = await createSqlConfig();
  globalAccessToken = token;
  globalTokenExpiresOn = expiresOn;

  // Close old pool if exists
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