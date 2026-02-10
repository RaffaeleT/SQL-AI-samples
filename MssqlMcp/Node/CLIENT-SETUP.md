# Client Setup Guide - Streamable HTTP Connection

This guide explains how to configure Claude Desktop and VS Code Agent to connect to a remote MSSQL MCP HTTP Server.

## Prerequisites

- The MSSQL MCP HTTP Server is running and accessible on your network
- You know the server's IP address and port (default: 3000)
- You can reach the server's `/health` endpoint

## Quick Verification

Before configuring your client, verify the server is accessible:

```bash
curl http://your-server-ip:3000/health
```

You should see a JSON response like:
```json
{
  "status": "ok",
  "server": "mssql-mcp-server",
  "version": "0.1.0",
  "readonly": false,
  "authMethod": "windows-integrated"
}
```

## Claude Desktop Configuration

### Step 1: Open Configuration File

**Windows:**
- File → Settings → Developer → Edit Config
- This opens `%APPDATA%\Claude\claude_desktop_config.json`

**macOS:**
- Claude → Settings → Developer → Edit Config
- This opens `~/Library/Application Support/Claude/claude_desktop_config.json`

**Linux:**
- Open `~/.config/Claude/claude_desktop_config.json`

### Step 2: Add Remote Server Configuration

Add or update the `mcpServers` section:

**Option A: Native Streamable HTTP (recommended for recent Claude Desktop versions):**

```json
{
  "mcpServers": {
    "mssql-remote": {
      "type": "streamableHttp",
      "url": "http://your-server-ip:3911/mcp"
    }
  }
}
```

**Option B: Using mcp-remote proxy (if native support is not available):**

```json
{
  "mcpServers": {
    "mssql-remote": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "http://your-server-ip:3911/mcp", "--allow-http"]
    }
  }
}
```


### Step 3: Restart Claude Desktop

Close and reopen Claude Desktop for changes to take effect.

### Step 4: Verify Connection

In a new conversation with Claude:

1. Look for the hammer icon (🔨) or tools indicator
2. Click on it to see available tools
3. You should see tools like:
   - `read_data`
   - `list_tables`
   - `describe_table`
   - etc.

## VS Code Agent Configuration

### Option 1: Workspace Configuration

1. Open your workspace folder in VS Code
2. Create or edit `.vscode/mcp.json`:

```json
{
  "servers": {
    "mssql-remote": {
      "type": "http",
      "url": "http://your-server-ip:3000/mcp"
    }
  }
}
```

### Option 2: User Settings

1. Open VS Code Settings (Ctrl+,)
2. Search for "mcp"
3. Click "Edit in settings.json"
4. Add:

```json
{
  "mcp": {
    "servers": {
      "mssql-remote": {
        "type": "http",
        "url": "http://your-server-ip:3000/mcp"
      }
    }
  }
}
```

### Verify Connection

1. Open Command Palette (Ctrl+Shift+P)
2. Run "MCP: List Servers"
3. You should see "mssql-remote" in the list
4. Run "MCP: Test Server Connection" to verify

## Troubleshooting

### Connection Refused

**Problem:** Cannot connect to server

**Solutions:**
1. Verify server is running: `curl http://server-ip:3000/health`
2. Check firewall rules allow incoming connections on port 3000
3. Verify server is listening on `0.0.0.0` (not `127.0.0.1`)
4. Check `HTTP_HOST` and `HTTP_PORT` in server's `.env` file

### Tools Not Appearing

**Problem:** Connected but tools don't show up

**Solutions:**
1. Check Claude Desktop or VS Code logs for errors
2. Verify the `/mcp` endpoint is accessible
3. Restart the client application
4. Check server logs for connection errors

### Slow Performance

**Problem:** Server responds slowly

**Solutions:**
1. Check network latency: `ping server-ip`
2. Verify SQL Server connection is stable
3. Check server resource usage (CPU, memory)
4. Review query complexity
5. Consider connection pooling settings

### Authentication Errors

**Problem:** Server returns authentication errors

**Solutions:**
1. Verify SQL Server credentials in server's `.env`
2. Check `AUTH_METHOD` is correctly set
3. For `windows-integrated`: Ensure server runs under correct Windows user
4. Test SQL connection independently: `sqlcmd -S server -d database -E`

## Network Configuration

### Firewall Rules (Windows Server)

Allow incoming connections on the HTTP port:

```powershell
New-NetFirewallRule -DisplayName "MSSQL MCP HTTP Server" `
                    -Direction Inbound `
                    -Protocol TCP `
                    -LocalPort 3000 `
                    -Action Allow
```

### DNS Configuration (Optional)

Instead of using IP addresses, configure a DNS name:

1. Add DNS A record: `mssql-mcp.company.local` → `192.168.1.100`
2. Update client configuration:
   ```json
   {
     "url": "http://mssql-mcp.company.local:3000/mcp"
   }
   ```

## Multiple Server Setup

You can connect to multiple MCP servers simultaneously:

```json
{
  "mcpServers": {
    "mssql-hr": {
      "transport": "http",
      "url": "http://hr-server:3000/mcp"
    },
    "mssql-finance": {
      "transport": "http",
      "url": "http://finance-server:3000/mcp"
    },
    "mssql-operations": {
      "transport": "http",
      "url": "http://ops-server:3000/mcp"
    }
  }
}
```

Claude will automatically use the appropriate server based on context.

## Load Balancing (Advanced)

For high-availability setups, use a load balancer:

1. Deploy multiple MCP server instances
2. Configure a load balancer (e.g., nginx, HAProxy, Azure Load Balancer)
3. Point client to load balancer URL:
   ```json
   {
     "url": "http://mssql-mcp-lb.company.local/mcp"
   }
   ```

### Example nginx Configuration

```nginx
upstream mssql_mcp_backend {
    least_conn;
    server 192.168.1.100:3000;
    server 192.168.1.101:3000;
    server 192.168.1.102:3000;
}

server {
    listen 80;
    server_name mssql-mcp.company.local;

    location / {
        proxy_pass http://mssql_mcp_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;

        # Streamable HTTP / SSE streaming support
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 86400s;
    }
}
```

## Security Best Practices

⚠️ **Current version lacks authentication!** Use only in trusted networks.

### Recommended Network Setup

1. **Internal Network Only**: Do not expose to internet
2. **VPN Access**: Require VPN for remote connections
3. **Network Segmentation**: Place in dedicated VLAN
4. **Firewall Rules**: Whitelist client IP addresses
5. **Monitoring**: Monitor connection logs regularly

### Temporary Security Measures

Until authentication is implemented:

1. Use only on corporate network
2. Restrict firewall rules to known client IPs
3. Use read-only mode when possible (`READONLY=true`)
4. Monitor server logs for unusual activity
5. Deploy behind VPN or bastion host

## Testing Your Setup

### Basic Connection Test

```bash
# Test health endpoint
curl http://your-server:3000/health

# Test MCP endpoint (POST with initialize request)
curl -X POST http://your-server:3000/mcp -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","method":"initialize","id":1,"params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}'
```

### Client Integration Test

In Claude Desktop or VS Code Agent:

```
User: "List all tables in the database"
```

Claude should use the `list_tables` tool and return results.

```
User: "Describe the structure of the users table"
```

Claude should use the `describe_table` tool with `tableName: "users"`.

## Support

For issues or questions:
- Check server logs: Look for error messages in the server console
- Check client logs:
  - Claude Desktop: Help → Show Logs
  - VS Code: Output → MCP
- Review documentation: `README.md` and `SECURITY-TODO.md`
- Test with `curl` to isolate network vs application issues

## Next Steps

1. ✅ Configure client
2. ✅ Test basic connection
3. ✅ Try sample queries
4. ⚠️ Plan security enhancements (see `SECURITY-TODO.md`)
5. 📋 Set up monitoring and logging
6. 🔒 Implement authentication (future)

---

**Last Updated:** 2024-02-09
