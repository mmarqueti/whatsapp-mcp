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
PORT=4000
MCP_PORT=8000
```

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
```

Features:
- Validate `hub.verify_token`

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

- Validate Meta webhook signature (optional v1).
- Restrict MCP tool usage to authenticated WebSocket clients.
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
  