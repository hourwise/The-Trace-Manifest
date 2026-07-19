---
title: "Build and inspect a minimal local MCP server with TypeScript"
category: development-tools
difficulty: advanced
verification_status: documentation-reviewed
author_name: "TRACE Editorial"
tested_os:
  - Windows 10 22H2
  - Windows 11
tested_versions:
  node: "24.18.0 LTS"
  mcp_typescript_sdk: "v1 documentation"
  typescript: "Current npm release"
estimated_cost: "Free"
destructive_steps: false
network_exposure: true
credentials_required: false
root_required: false
downloads_executable: true
last_verified: 2026-07-19
review_due: 2026-08-19
sources:
  - name: "MCP TypeScript SDK"
    url: "https://ts.sdk.modelcontextprotocol.io/"
    relationship: instruction-source
  - name: "MCP TypeScript server documentation"
    url: "https://ts.sdk.modelcontextprotocol.io/server"
    relationship: instruction-source
  - name: "MCP Inspector"
    url: "https://modelcontextprotocol.io/docs/tools/inspector"
    relationship: verification-source
  - name: "MCP architecture"
    url: "https://modelcontextprotocol.io/docs/learn/architecture"
    relationship: concept-source
  - name: "MCP security best practices"
    url: "https://modelcontextprotocol.io/docs/tutorials/security/security_best_practices"
    relationship: security-source
---

# Build and inspect a minimal local MCP server with TypeScript

**Status:** Draft — not published or indexed.

## What you will achieve

You will create a local Model Context Protocol server using the TypeScript SDK, expose one non-destructive `echo` tool over standard input/output, and test it with the official MCP Inspector.

## Who this is for

This guide is for developers already comfortable with Node.js, npm, TypeScript, terminals, and basic JSON schemas.

It does not create a remote HTTP server, authentication system, filesystem tool, shell tool, or production MCP deployment.

## Requirements and expected cost

- Node.js 24 LTS.
- npm.
- Git is optional.
- An internet connection for npm packages.
- Cost: free.

The MCP Inspector launches a local web interface and proxy. Keep it on loopback and close it after testing.

## Tested environment and version scope

The guide uses the MCP TypeScript SDK v1 documentation, `McpServer`, `StdioServerTransport`, and Zod schemas.

## Before you begin

Use a new empty folder. Do not place this experiment inside a production repository.

The stdio transport reserves standard output for protocol messages. Do not add ordinary `console.log` calls to the server. Use standard error or structured MCP logging when diagnostics are needed.

## Step-by-step instructions

### Step 1: Create the project

```powershell
# OS: Windows 10 22H2 or Windows 11
# Shell: PowerShell
# Directory: A parent development folder
# Admin: Not required
# Writes/deletes: Creates trace-mcp-hello and package.json
# Network/ports: None
# Downloads code: No
# Replace: You may replace trace-mcp-hello with another new folder name
New-Item -ItemType Directory -Path ".\trace-mcp-hello"
Set-Location ".\trace-mcp-hello"
npm init -y
```

Expected output: a new `package.json`.

### Step 2: Install runtime and development dependencies

```powershell
# OS: Windows 10 22H2 or Windows 11
# Shell: PowerShell
# Directory: trace-mcp-hello
# Admin: Not required
# Writes/deletes: Creates node_modules and package-lock.json; updates package.json
# Network/ports: Outbound HTTPS to npm registry
# Downloads code: Yes, SDK, schema library, TypeScript runtime, and type packages
# Replace: Nothing
npm install @modelcontextprotocol/sdk zod
npm install --save-dev typescript tsx @types/node @modelcontextprotocol/inspector
```

Expected output: packages installed successfully.

Review package names and the lockfile before continuing.

### Step 3: Configure ESM and scripts

```powershell
# OS: Windows 10 22H2 or Windows 11
# Shell: PowerShell
# Directory: trace-mcp-hello
# Admin: Not required
# Writes/deletes: Updates package.json fields
# Network/ports: None
# Downloads code: No
# Replace: Nothing
npm pkg set type=module
npm pkg set scripts.start="tsx server.ts"
npm pkg set scripts.inspect="mcp-inspector npx tsx server.ts"
```

Expected output: no output; `package.json` contains the new fields.

### Step 4: Create the MCP server

Create `server.ts` with this content:

```typescript
// File-write safety record:
// OS: Windows 10/11; file: trace-mcp-hello/server.ts
// Writes/deletes: Creates one local source file
// Network/ports: The server uses stdio and opens no network listener
// Downloads code: No
// Replace: Nothing

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({
  name: "trace-mcp-hello",
  version: "1.0.0",
});

server.registerTool(
  "echo",
  {
    title: "Echo text",
    description: "Return exactly the text supplied by the caller.",
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
    structuredContent: {
      message,
    },
  }),
);

const transport = new StdioServerTransport();
await server.connect(transport);
```

The tool has no filesystem, network, shell, credential, or write authority.

### Step 5: Run a TypeScript check

```powershell
# OS: Windows 10 22H2 or Windows 11
# Shell: PowerShell
# Directory: trace-mcp-hello
# Admin: Not required
# Writes/deletes: TypeScript may write cache data; no emitted JavaScript requested
# Network/ports: None
# Downloads code: No
# Replace: Nothing
npx tsc --noEmit --module nodenext --moduleResolution nodenext --target es2022 server.ts
```

Expected output: no TypeScript errors.

### Step 6: Start the server directly

```powershell
# OS: Windows 10 22H2 or Windows 11
# Shell: PowerShell
# Directory: trace-mcp-hello
# Admin: Not required
# Writes/deletes: None expected
# Network/ports: No network listener; stdio process waits for an MCP client
# Downloads code: No
# Replace: Nothing
npm start
```

Expected behaviour: the process waits without printing ordinary output. Stop it with `Ctrl+C`. Waiting silently is normal for a stdio server that has no connected client.

### Step 7: Inspect the server

```powershell
# OS: Windows 10 22H2 or Windows 11
# Shell: PowerShell
# Directory: trace-mcp-hello
# Admin: Not required
# Writes/deletes: Inspector may write npm cache and local session data
# Network/ports: Opens an Inspector interface and proxy on loopback-only local ports
# Downloads code: No additional package expected because Inspector is installed locally
# Replace: Nothing
npm run inspect
```

Expected result: the MCP Inspector opens or displays a local URL.

In the Inspector:

1. Connect to the server.
2. Open the **Tools** section.
3. Select `echo`.
4. Enter a short message.
5. Invoke the tool.
6. Confirm that the response exactly matches the input.

Close the Inspector and terminal processes after testing.

## Verify success

| Command or action | Expected result | Safety record |
| --- | --- | --- |
| `npx tsc --noEmit ...` | No TypeScript errors. | Local inspection/compilation only. |
| `npm start` | Silent stdio server waits for a client. | No network listener. |
| `npm run inspect` | Local Inspector connects. | Opens loopback UI/proxy. |
| Invoke `echo` | Returned text matches supplied text. | No side effects. |

## Security checks

- Keep the first server on stdio.
- Do not write secrets or logs to stdout.
- Validate every tool argument with bounded schemas.
- Separate read tools from write or execution tools.
- Do not add shell, filesystem, network, payment, deployment, or deletion capabilities without explicit policy and approval.
- Treat tool descriptions, prompts, resources, and client-provided content as untrusted.
- If moving to Streamable HTTP, bind to loopback during development and use the SDK's DNS-rebinding protections.
- Add authentication and resource-bound authorisation before remote deployment.
- Pin and review dependencies for production.
- Test with malformed, oversized, and unexpected arguments.

## Common errors

### Inspector cannot connect

Confirm the start command, working directory, and Node version. Run `npm start` separately to expose import or TypeScript errors.

### JSON-RPC parsing errors appear

Remove all `console.log` output from a stdio server. Diagnostic text on stdout corrupts the protocol stream.

### `structuredContent` causes a type error

SDK versions can differ. Keep the text `content` response and remove `structuredContent`, or add an explicit output schema according to the installed SDK documentation.

### Tool is missing

Confirm that `registerTool` executes before `server.connect` and that the Inspector connected to the intended command.

## How to undo or remove it

Stop the server and Inspector. Move to the parent folder, verify the name, and delete the experiment:

```powershell
# OS: Windows 10 22H2 or Windows 11
# Shell: PowerShell
# Directory: Parent of trace-mcp-hello
# Admin: Not required
# Writes/deletes: Permanently deletes the entire experimental project
# Network/ports: None after processes are stopped
# Downloads code: No
# Replace: Verify the folder name before running
Remove-Item -LiteralPath ".\trace-mcp-hello" -Recurse -Force
```

## What to do next

Add tests for invalid input, introduce one read-only resource, and document a risk class for every capability before connecting the server to an AI host.

## Sources

- [MCP TypeScript SDK](https://ts.sdk.modelcontextprotocol.io/) — Installation, transports, server and client concepts.
- [MCP TypeScript server documentation](https://ts.sdk.modelcontextprotocol.io/server) — `McpServer`, stdio, Streamable HTTP, and DNS-rebinding guidance.
- [MCP Inspector](https://modelcontextprotocol.io/docs/tools/inspector) — Official local server inspection workflow.
- [MCP architecture](https://modelcontextprotocol.io/docs/learn/architecture) — Hosts, clients, servers, tools, resources, and prompts.
- [MCP security best practices](https://modelcontextprotocol.io/docs/tutorials/security/security_best_practices) — Prompt injection, token, session, and server risks.
