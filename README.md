# WhatsApp Cloud API MCP Server – Spec v1.0

## Overview
This project defines version **1.0** of an **MCP Server** that exposes the **WhatsApp Cloud API** to LLM agents through standardized MCP tools.

Goal: Provide a minimal, clean, production-ready baseline so developers can use WhatsApp messaging inside AI agents with zero complexity.

---

## Quick Start

1. Copy the environment template and fill in your Meta credentials:
   ```bash
   cp .env.example .env
   ```
   Set `MCP_AUTH_TOKEN` to a strong random secret as well - the MCP WebSocket
   server refuses to start without it. `META_APP_SECRET` (App Secret in the
   Meta App Dashboard) is required too: `POST /webhook` rejects any delivery
   whose `X-Hub-Signature-256` does not match it.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run the server locally:
   ```bash
   npm run dev
   ```

> Tip: if you're testing only the MCP tools locally, use valid WhatsApp Cloud API credentials in `.env`. For webhook-only testing, you can use placeholder values while simulating incoming payloads.

# 1. Objectives

- Create a lightweight MCP server (TypeScript + Node.js).
- Expose WhatsApp Cloud API functionalities as tools.
- Provide helpers for webhook verification.
- Be deployable with a single command (Docker + local dev).

---

# 2. Tech Stack

- **Node.js 20+**
- **TypeScript**
- **Express** (or Fastify) for HTTP + webhooks
- **MCP Server SDK**
- **Axios** for outbound WhatsApp API requests
- **WebSocket** for MCP transport (mandatory)
- **Dotenv** for configs
- **Pino** or console logging

---

# 3. Project Structure (v1.0)

```
/src
  /mcp
    server.ts
  /whatsapp
    client.ts
    webhook.ts
  /config
    env.ts
  index.ts
.env.example
mcp.json
package.json
README.md
```

---

# 4. Environment Variables

Required:

```
META_WHATSAPP_TOKEN=
META_WHATSAPP_PHONE_ID=
META_WHATSAPP_WABA_ID=
META_VERIFY_TOKEN=
META_APP_SECRET=
MCP_AUTH_TOKEN=
PORT=4000
MCP_PORT=8000
```

`MCP_AUTH_TOKEN` is the shared secret that authenticates MCP WebSocket
clients. The server exits on startup if it is missing.

`META_APP_SECRET` is the App Secret of the Meta app (App Dashboard ->
Settings -> Basic). It authenticates incoming webhook deliveries: the
server exits on startup if it is missing, and every `POST /webhook` is
validated against it.

Optional:

```
LOG_LEVEL=debug
```

---

# 5. WhatsApp Cloud API Endpoints to Support (v1.0)

The MCP server will call these official endpoints:

### **Send Text Message**
```
POST /v18.0/{PHONE_ID}/messages
```

### **Send Template Message**
```
POST /v18.0/{PHONE_ID}/messages
```

### **Get Media URL**
```
GET /v18.0/{MEDIA_ID}
```

### **Download Media**
```
GET {MEDIA_URL}
```

### **Health Check**
```
GET /v18.0/{PHONE_ID}
```

---

# 6. Webhook Handling

Expose:
```
GET  /webhook (verification)
POST /webhook (incoming messages)
```

Features:
- Validate `hub.verify_token`
- Normalize incoming customer messages from the Meta webhook payload and
  broadcast them to every connected MCP client as a
  `whatsapp.incoming_message` notification (see `docs/use_case.md`):
  ```json
  {
    "method": "notifications/message",
    "params": {
      "name": "whatsapp.incoming_message",
      "data": {
        "from": "+15550123456",
        "type": "text",
        "text": "Hi, is my order #1234 ready?",
        "timestamp": 1715623400,
        "id": "wamid.HBgLM..."
      }
    }
  }
  ```
- Validate the `X-Hub-Signature-256` header on every `POST /webhook`
  against `META_APP_SECRET` (HMAC-SHA256 over the raw body, constant-time
  comparison). Unsigned or badly signed requests are rejected with 401
  before the payload is read.
- Always ack valid `POST /webhook` deliveries with 200 (Meta retries on
  non-2xx); delivery receipts (`statuses`) are acknowledged but not
  broadcast.

---

# 7. MCP Tools (v1.0)

Tools exposed to agents:

## **1. send_text_message**
Send a simple text message to a WhatsApp user.

### Params:
```json
{
  "to": "string",
  "text": "string"
}
```

## **2. send_template_message**
Send a WhatsApp template message.

### Params:
```json
{
  "to": "string",
  "template_name": "string",
  "language": "string",
  "components": []
}
```

## **3. get_media**
Retrieve a media file by MEDIA_ID.

### Params:
```json
{
  "media_id": "string"
}
```

## **4. health_check**
Verify connectivity with WhatsApp Cloud API.

---

# 8. Security

- **MCP WebSocket authentication (required).** Every WebSocket client must
  present the shared `MCP_AUTH_TOKEN`, either as an
  `Authorization: Bearer <token>` header or as a `?token=<token>` query
  parameter (for MCP clients that cannot set headers). Connections without a
  valid token are rejected during the upgrade handshake, and the server
  refuses to start when `MCP_AUTH_TOKEN` is not set. Example:
  `ws://localhost:4000/?token=$MCP_AUTH_TOKEN`
- **Meta webhook signature validation (required).** Every `POST /webhook`
  must carry a valid `X-Hub-Signature-256` header: HMAC-SHA256 of the raw
  request body keyed with `META_APP_SECRET`, compared in constant time.
  Requests without a valid signature are rejected with 401, so forged
  payloads never reach the MCP broadcast.
- Sanitize user inputs.
- Never log tokens.

---

# 9. Documentation Requirements

## Setup Instructions

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Configure Environment**
   Copy `.env.example` to `.env` and fill in your Meta WhatsApp API credentials.
   ```bash
   cp .env.example .env
   ```

3. **Run Locally**
   ```bash
   npm run dev
   ```
   Server will start on port 4000 (HTTP) and expose MCP on WebSocket.

4. **Configure Webhook**
   - Expose your local server using ngrok or similar: `ngrok http 4000`
   - In Meta App Dashboard, set Webhook URL to `https://<your-ngrok-url>/webhook`
   - Set Verify Token to match `META_VERIFY_TOKEN` in `.env`

## Docker Usage

```bash
docker build -t whatsapp-mcp .
docker run -p 4000:4000 --env-file .env whatsapp-mcp
```

## Example Usage with Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "whatsapp": {
      "command": "docker",
      "args": ["run", "-i", "--rm", "--env-file", "/path/to/.env", "whatsapp-mcp"]
    }
  }
}
```
(Note: For local dev without docker, point to the build output)

# 10. Contact

For any inquiries or similar projects, please contact: marcelo@marcelomarchetti.com
  
