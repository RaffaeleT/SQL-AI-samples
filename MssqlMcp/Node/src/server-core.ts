#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { readdir, readFile } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

import { ensureSqlConnection } from "./db.js";
import { UpdateDataTool } from "./tools/UpdateDataTool.js";
import { InsertDataTool } from "./tools/InsertDataTool.js";
import { ReadDataTool } from "./tools/ReadDataTool.js";
import { CreateTableTool } from "./tools/CreateTableTool.js";
import { CreateIndexTool } from "./tools/CreateIndexTool.js";
import { ListTableTool } from "./tools/ListTableTool.js";
import { DropTableTool } from "./tools/DropTableTool.js";
import { DescribeTableTool } from "./tools/DescribeTableTool.js";

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
    const promptsDir = join(__dirname, "prompts");
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

// Patch all tool handlers to ensure SQL connection before running
function wrapToolRun(tool: { run: (...args: any[]) => Promise<any> }) {
  const originalRun = tool.run.bind(tool);
  tool.run = async function (...args: any[]) {
    await ensureSqlConnection();
    return originalRun(...args);
  };
}

/**
 * Creates and returns a fully configured MCP Server instance.
 * Can be called multiple times (e.g. once per SSE session).
 * All instances share the same SQL connection pool via db.ts.
 */
export function createMcpServer(): Server {
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

  const isReadOnly = process.env.READONLY === "true";

  const updateDataTool = new UpdateDataTool();
  const insertDataTool = new InsertDataTool();
  const readDataTool = new ReadDataTool();
  const createTableTool = new CreateTableTool();
  const createIndexTool = new CreateIndexTool();
  const listTableTool = new ListTableTool();
  const dropTableTool = new DropTableTool();
  const describeTableTool = new DescribeTableTool();

  const allTools = [insertDataTool, readDataTool, updateDataTool, createTableTool, createIndexTool, dropTableTool, listTableTool, describeTableTool];
  allTools.forEach(wrapToolRun);

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
