# MSSQL Database MCP  Server

<div align="center">
  <img src="./src/img/logo.png" alt="MSSQL Database MCP server logo" width="400"/>
</div>

> ⚠️ **EXPERIMENTAL USE ONLY** - This MCP Server is provided as an example for educational and experimental purposes only. It is NOT intended for production use. Please use appropriate security measures and thoroughly test before considering any kind of deployment.

## What is this? 🤔

This is a server that lets your LLMs (like Claude) talk directly to your MSSQL Database data! Think of it as a friendly translator that sits between your AI assistant and your database, making sure they can chat securely and efficiently.

### Quick Example
```text
You: "Show me all customers from New York"
Claude: *queries your MSSQL Database database and gives you the answer in plain English*
```

## How Does It Work? 🛠️

This server leverages the Model Context Protocol (MCP), a versatile framework that acts as a universal translator between AI models and databases. It supports multiple AI assistants including Claude Desktop and VS Code Agent.

### What Can It Do? 📊

- Run MSSQL Database queries by just asking questions in plain English
- Create, read, update, and delete data
- Manage database schema (tables, indexes)
- Secure connection handling
- Real-time data interaction

## Quick Start 🚀

### Prerequisites
- Node.js 14 or higher
- Claude Desktop or VS Code with Agent extension

### Set up project

1. **Install Dependencies**  
   Run the following command in the root folder to install all necessary dependencies:  
   ```bash
   npm install
   ```

2. **Build the Project**  
   Compile the project by running:  
   ```bash
   npm run build
   ```

## Configuration Setup

### Option 1: VS Code Agent Setup

1. **Install VS Code Agent Extension**
   - Open VS Code
   - Go to Extensions (Ctrl+Shift+X)
   - Search for "Agent" and install the official Agent extension

2. **Create MCP Configuration File**
   - Create a `.vscode/mcp.json` file in your workspace
   - Add the following configuration:

   ```json
   {
     "servers": {
       "mssql-nodejs": {
          "type": "stdio",
          "command": "node",
          "args": ["q:\\Repos\\SQL-AI-samples\\MssqlMcp\\Node\\dist\\index.js"],
          "env": {
            "SERVER_NAME": "your-server-name.database.windows.net",
            "DATABASE_NAME": "your-database-name",
            "READONLY": "false"
          }
        }
      }
   }
   ```

3. **Alternative: User Settings Configuration**
   - Open VS Code Settings (Ctrl+,)
   - Search for "mcp"
   - Click "Edit in settings.json"
   - Add the following configuration:

  ```json
   {
    "mcp": {
        "servers": {
            "mssql": {
                "command": "node",
                "args": ["C:/path/to/your/Node/dist/index.js"],
                "env": {
                "SERVER_NAME": "your-server-name.database.windows.net",
                "DATABASE_NAME": "your-database-name",
                "READONLY": "false"
                }
            }
        }
    }
  }
  ```

4. **Restart VS Code**
   - Close and reopen VS Code for the changes to take effect

5. **Verify MCP Server**
   - Open Command Palette (Ctrl+Shift+P)
   - Run "MCP: List Servers" to verify your server is configured
   - You should see "mssql" in the list of available servers

### Option 2: Claude Desktop Setup

1. **Open Claude Desktop Settings**
   - Navigate to File → Settings → Developer → Edit Config
   - Open the `claude_desktop_config` file

2. **Add MCP Server Configuration**
   Replace the content with the configuration below, updating the path and credentials:

   ```json
   {
     "mcpServers": {
       "mssql": {
         "command": "node",
         "args": ["C:/path/to/your/Node/dist/index.js"],
         "env": {
           "SERVER_NAME": "your-server-name.database.windows.net",
           "DATABASE_NAME": "your-database-name",
           "READONLY": "false"
         }
       }
     }
   }
   ```

3. **Restart Claude Desktop**
   - Close and reopen Claude Desktop for the changes to take effect

### Configuration Parameters

- **SERVER_NAME**: Your MSSQL Database server name (e.g., `my-server.database.windows.net`)
- **DATABASE_NAME**: Your database name
- **READONLY**: Set to `"true"` to restrict to read-only operations, `"false"` for full access
- **Path**: Update the path in `args` to point to your actual project location.
- **CONNECTION_TIMEOUT**: (Optional) Connection timeout in seconds. Defaults to `30` if not set.
- **TRUST_SERVER_CERTIFICATE**: (Optional) Set to `"true"` to trust self-signed server certificates (useful for development or when connecting to servers with self-signed certs). Defaults to `"false"`.

## HTTP/SSE Deployment (Network Access)

For deploying the MCP server on a Windows Server to serve multiple clients over a local network, use the HTTP/SSE transport instead of stdio.

### Starting the HTTP Server

```bash
# Development
npm run start:http

# Server listens on http://0.0.0.0:3000
# Endpoints:
#   GET  http://localhost:3000/sse       - SSE connection
#   POST http://localhost:3000/messages  - Message routing
#   GET  http://localhost:3000/health    - Health check
```

### Configuration

Create a `.env` file in the project root (or set environment variables):

```env
# Database connection
SERVER_NAME=your-server-name
DATABASE_NAME=your-database-name

# Authentication method: "azure-ad" (default), "sql", "windows", or "windows-integrated"
AUTH_METHOD=windows-integrated

# For SQL Authentication
SQL_USERNAME=your-username
SQL_PASSWORD=your-password

# For Windows NTLM Authentication
DOMAIN=YOUR_DOMAIN
USERNAME=your-username
PASSWORD=your-password

# Optional
HTTP_PORT=3000
HTTP_HOST=0.0.0.0
READONLY=false
TRUST_SERVER_CERTIFICATE=true
ENCRYPT=false
CONNECTION_TIMEOUT=30
```

### Windows Service Installation

Install as a Windows Service for auto-start and production use:

```bash
# As Administrator
scripts\install-service.bat

# For Windows Integrated Auth, configure the service account:
# 1. Open Services (services.msc)
# 2. Find "MssqlMcpServer"
# 3. Right-click → Properties → Log On
# 4. Select "This account" and enter a domain account with SQL access
# 5. Click OK and restart the service

# Start/stop/restart the service
nssm start MssqlMcpServer
nssm stop MssqlMcpServer
nssm restart MssqlMcpServer

# View logs
type logs\service.log
type logs\error.log

# Uninstall
scripts\uninstall-service.bat
```

**Prerequisites for Windows Service:**
- NSSM (Non-Sucking Service Manager) - download from https://nssm.cc/
- Add NSSM to PATH or place in scripts folder

### Firewall Configuration

Allow inbound connections on the HTTP port:

```cmd
netsh advfirewall firewall add rule name="MCP SSE Server" dir=in action=allow protocol=tcp localport=3000
```

### Client Configuration (SSE)

Configure your MCP clients to connect to the SSE endpoint:

**Claude Desktop:**
```json
{
  "mcpServers": {
    "mssql": {
      "type": "sse",
      "url": "http://<server-ip>:3000/sse"
    }
  }
}
```

**VS Code Agent:**
```json
{
  "mcp": {
    "servers": {
      "mssql": {
        "type": "sse",
        "url": "http://<server-ip>:3000/sse"
      }
    }
  }
}
```

### Health Check

Monitor server status:

```bash
curl http://localhost:3000/health

# Response:
# {
#   "status": "ok",
#   "activeSessions": 2,
#   "authMethod": "windows-integrated",
#   "readonly": false
# }
```

### Authentication Methods

- **azure-ad** (default): Interactive browser authentication for Azure SQL
- **windows-integrated**: Uses current Windows session credentials (requires ODBC Driver 17)
- **windows**: NTLM with explicit domain credentials
- **sql**: SQL Server username/password

### Multiple Concurrent Clients

The HTTP/SSE server supports multiple simultaneous MCP client connections. Each client establishes its own SSE session with a unique session ID, but all sessions share the same SQL connection pool for efficiency.

## Sample Configurations

You can find sample configuration files in the `src/samples/` folder:
- `claude_desktop_config.json` - For Claude Desktop (stdio)
- `vscode_agent_config.json` - For VS Code Agent (stdio)

## Usage Examples

Once configured, you can interact with your database using natural language:

- "Show me all users from New York"
- "Create a new table called products with columns for id, name, and price"
- "Update all pending orders to completed status"
- "List all tables in the database"

## Security Notes

- The server requires a WHERE clause for read operations to prevent accidental full table scans
- Update operations require explicit WHERE clauses for security
- Set `READONLY: "true"` in environments if you only need read access

You should now have successfully configured the MCP server for MSSQL Database with your preferred AI assistant. This setup allows you to seamlessly interact with MSSQL Database through natural language queries!
