---
title: "Build a loopback-only MCP server using Streamable HTTP"
category: development-tools
difficulty: advanced
verification_status: documentation-reviewed
author_name: "TRACE Editorial"
tested_os:
  - Windows 10
  - Windows 11
tested_versions:
  node: "24.x LTS"
  mcp_typescript_sdk: "v1 documentation"
  express: "Current locked project version"
estimated_cost: "Free"
destructive_steps: true
network_exposure: true
credentials_required: false
root_required: false
downloads_executable: true
last_verified: 2026-07-19
review_due: 2026-08-19
sources:
  - name: "MCP TypeScript server documentation"
    url: "https://ts.sdk.modelcontextprotocol.io/server"
    relationship: instruction-source
  - name: "MCP TypeScript SDK"
    url: "https://ts.sdk.modelcontextprotocol.io/"
    relationship: instruction-source
  - name: "MCP Inspector"
    url: "https://modelcontextprotocol.io/docs/tools/inspector"
    relationship: verification-source
  - name: "MCP authorization specification"
    url: "https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization"
    relationship: security-source
  - name: "MCP security best practices"
    url: "https://modelcontextprotocol.io/docs/tutorials/security/security_best_practices"
    relationship: security-source
---

# Build a loopback-only MCP server using Streamable HTTP

**Status:** Draft — not published or indexed.

## What you will achieve

You will build a stateless MCP server over the recommended Streamable HTTP transport, expose one side-effect-free tool on `127.0.0.1`, reject unsupported HTTP methods, and test the endpoint with the MCP Inspector.

## Who this is for

This guide is for developers who completed a basic stdio MCP server and understand Node.js, TypeScript, HTTP, schemas, and local networking.

It is not a production remote MCP server. It deliberately has no authentication and must remain loopback-only. A remotely reachable MCP server requires HTTPS, OAuth-based authorisation, resource-bound tokens, scopes, secure token storage, and additional operational controls.

## Requirements and expected cost

- Node.js 24 LTS and npm.
- A new empty project folder.
- Internet access for packages.
- Cost: free.

## Tested environment and version scope

The guide follows the MCP TypeScript SDK v1 documentation, where Streamable HTTP is recommended for remote-capable transport and HTTP+SSE is deprecated.

## Before you begin

Use a new disposable folder.

The server has no authentication. Binding it to `0.0.0.0`, a LAN address, a tunnel, or a public host would expose the tool endpoint without an identity boundary.

Do not copy this example into production unchanged.

## Step-by-step instructions

### Step 1: Create the project

```powershell
# OS: Windows 10 or Windows 11
# Shell: PowerShell
# Directory: Parent development folder
# Admin: Not required
# Writes/deletes: Creates trace-mcp-http and package.json
# Port exposure: None
# Downloads code: No
# Variables to replace: You may replace trace-mcp-http with another new folder name
New-Item -ItemType Directory -Path .\trace-mcp-http
Set-Location .\trace-mcp-http
npm init -y
```

Expected output: new `package.json`.

### Step 2: Install dependencies locally

```powershell
# OS: Windows 10 or Windows 11
# Shell: PowerShell
# Directory: trace-mcp-http
# Admin: Not required
# Writes/deletes: Creates node_modules and lockfile; updates package.json
# Port exposure: None
# Downloads code: Yes, MCP SDK, Express, Zod, TypeScript tooling, and Inspector
# Variables to replace: None
npm install @modelcontextprotocol/sdk express zod
npm install --save-dev typescript tsx @types/node @types/express @modelcontextprotocol/inspector
```

Expected output: dependencies installed.

### Step 3: Configure package scripts

```powershell
# OS: Windows 10 or Windows 11
# Shell: PowerShell
# Directory: Project root
# Admin: Not required
# Writes/deletes: Updates package.json
# Port exposure: None
# Downloads code: No
# Variables to replace: None
npm pkg set type=module
npm pkg set scripts.start="tsx server.ts"
npm pkg set scripts.inspect="mcp-inspector"
```

Expected output: no terminal output.

### Step 4: Create `server.ts`

```typescript
// File-write safety record:
// OS: Windows 10/11; file: project-root server.ts
// Writes/deletes: Creates one local source file
// Port exposure: Opens only 127.0.0.1:3000 when run
// Downloads code: No
// Variables to replace: None

import express, { type Request, type Response } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

const HOST = "127.0.0.1";
const PORT = 3000;
const MCP_PATH = "/mcp";

function createServer(): McpServer {
  const server = new McpServer({
    name: "trace-loopback-http",
    version: "1.0.0",
  });

  server.registerTool(
    "echo",
    {
      title: "Echo text",
      description: "Return the caller-supplied text without external side effects.",
      inputSchema: {
        message: z.string().min(1).max(500),
      },
    },
    async ({ message }) => ({
      content: [
        {
          type: "text",
          text: message,
        },
      ],
    }),
  );

  return server;
}

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "64kb" }));

app.post(MCP_PATH, async (req: Request, res: Response) => {
  const server = createServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  res.on("close", () => {
    void transport.close();
    void server.close();
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error("MCP request failed:", error);

    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: {
          code: -32603,
          message: "Internal server error",
        },
        id: null,
      });
    }
  }
});

app.get(MCP_PATH, (_req, res) => {
  res.status(405).set("Allow", "POST").send("Method not allowed");
});

app.delete(MCP_PATH, (_req, res) => {
  res.status(405).set("Allow", "POST").send("Method not allowed");
});

app.listen(PORT, HOST, () => {
  console.error(`MCP endpoint listening at http://${HOST}:${PORT}${MCP_PATH}`);
});
```

This example creates a fresh stateless MCP server for each POST request. It has no persistent sessions and no external capabilities.

### Step 5: Type-check the server

```powershell
# OS: Windows 10 or Windows 11
# Shell: PowerShell
# Directory: Project root
# Admin: Not required
# Writes/deletes: No emitted JavaScript; TypeScript may write cache metadata
# Port exposure: None
# Downloads code: No
# Variables to replace: None
npx tsc --noEmit --module nodenext --moduleResolution nodenext --target es2022 server.ts
```

Expected output: no errors.

### Step 6: Start the server

```powershell
# OS: Windows 10 or Windows 11
# Shell: PowerShell
# Directory: Project root
# Admin: Not required
# Writes/deletes: None expected
# Port exposure: Opens 127.0.0.1:3000 only
# Downloads code: No
# Variables to replace: None
npm start
```

Expected output on standard error: `MCP endpoint listening at http://127.0.0.1:3000/mcp`.

Leave this terminal open.

### Step 7: Verify that the listener is loopback-only

In another PowerShell window:

```powershell
# OS: Windows 10 or Windows 11
# Shell: PowerShell
# Directory: Any directory
# Admin: Not required
# Writes/deletes: None
# Port exposure: Inspects existing port 3000; opens nothing
# Downloads code: No
# Variables to replace: None
Get-NetTCPConnection -LocalPort 3000 -State Listen |
  Select-Object LocalAddress, LocalPort, OwningProcess
```

Expected output: `127.0.0.1`, not `0.0.0.0` or a LAN address.

### Step 8: Confirm unsupported GET is rejected

```powershell
# OS: Windows 10 or Windows 11
# Shell: PowerShell
# Directory: Any directory
# Admin: Not required
# Writes/deletes: None
# Port exposure: Loopback HTTP request only
# Downloads code: No
# Variables to replace: None
try {
  Invoke-WebRequest "http://127.0.0.1:3000/mcp" -Method Get
} catch {
  $_.Exception.Response.StatusCode.value__
}
```

Expected output: `405`.

### Step 9: Start the MCP Inspector

From the project folder in a third terminal:

```powershell
# OS: Windows 10 or Windows 11
# Shell: PowerShell
# Directory: Project root
# Admin: Not required
# Writes/deletes: May write local npm or Inspector state
# Port exposure: Opens Inspector UI and proxy on loopback ports
# Downloads code: No additional package expected because Inspector is installed locally
# Variables to replace: None
npm run inspect
```

Expected output: local Inspector URL.

In the Inspector:

1. Choose **Streamable HTTP**.
2. Enter `http://127.0.0.1:3000/mcp`.
3. Connect.
4. List tools.
5. Invoke `echo` with `{"message":"streamable http working"}`.
6. Confirm the same text is returned.

Stop Inspector and server processes with `Ctrl+C`.

## Verify success

| Command or action | Expected result | Safety record |
| --- | --- | --- |
| Type check | No errors. | Local inspection. |
| `Get-NetTCPConnection` | Listener is `127.0.0.1:3000`. | Inspection only. |
| GET request | HTTP 405. | Loopback request. |
| Inspector lists tools | `echo` appears. | Local loopback MCP connection. |
| Invoke `echo` | Exact supplied text returned. | No external side effects. |

## Security checks

- Keep the server bound to `127.0.0.1`.
- Do not add permissive CORS headers.
- Limit request-body size.
- Validate every tool input.
- Keep tools side-effect-free until identity, permissions, approvals, and audit are designed.
- Do not accept bearer tokens in query strings.
- For remote use, implement HTTPS and the current MCP OAuth authorisation specification.
- Validate token audience and scopes on every request.
- Protect OAuth discovery from server-side request forgery and DNS rebinding.
- Use short-lived tokens and secure token storage.
- Add rate limits, timeouts, structured logs, and correlation identifiers.
- Treat Inspector and development servers as temporary local tools.

## Common errors

### Import path cannot be resolved

Confirm the installed SDK version and compare its server documentation. SDK v2 changes package and transport import locations.

### Inspector cannot connect

Confirm the server terminal is still running, the endpoint path is `/mcp`, and Streamable HTTP is selected.

### Listener shows `0.0.0.0`

Stop the process and restore `HOST = "127.0.0.1"` before continuing.

### JSON parse errors

Confirm the request uses JSON and that no proxy is rewriting the body. Do not log protocol responses to a different transport channel.

## How to undo or remove it

Stop all local processes. Move to the parent folder and delete the disposable project:

```powershell
# OS: Windows 10 or Windows 11
# Shell: PowerShell
# Directory: Parent of trace-mcp-http
# Admin: Not required
# Writes/deletes: Permanently deletes the whole demonstration project
# Port exposure: Ensure server and Inspector are stopped
# Downloads code: No
# Variables to replace: Replace folder name if changed
Remove-Item -LiteralPath .\trace-mcp-http -Recurse -Force
```

## What to do next

Add integration tests, a read-only resource, structured audit events, and a real OAuth resource-server design before considering any non-loopback deployment.

## Sources

- [MCP TypeScript server documentation](https://ts.sdk.modelcontextprotocol.io/server) — Streamable HTTP recommendation, stateless examples, and transport behaviour.
- [MCP TypeScript SDK](https://ts.sdk.modelcontextprotocol.io/) — Package installation, server primitives, and supported transports.
- [MCP Inspector](https://modelcontextprotocol.io/docs/tools/inspector) — Local connection and tool inspection.
- [MCP authorization specification](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization) — HTTPS, OAuth, resource indicators, token audience, PKCE, and secure storage.
- [MCP security best practices](https://modelcontextprotocol.io/docs/tutorials/security/security_best_practices) — SSRF, DNS rebinding, token, session, prompt-injection, and local-server threats.
