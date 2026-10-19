import express from 'express';
import { createServer } from 'http';
import { config } from './config/env.js';
import { webhookRouter } from './whatsapp/webhook.js';
import { mcpServer } from './mcp/server.js';

const app = express();
const httpServer = createServer(app);

// Middleware
app.use(express.json());

// Routes
app.use('/webhook', webhookRouter);

// Health check
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok' });
});

// Start servers
async function main() {
    try {
        const args = process.argv.slice(2);
        const useStdio = args.includes('--stdio');

        if (useStdio) {
            // Start MCP Server (Stdio)
            await mcpServer.startStdio();
        } else {
            // Start MCP Server (WebSocket) - fail fast without an auth token,
            // otherwise anyone who can reach the port could send WhatsApp
            // messages through this server.
            if (!config.MCP_AUTH_TOKEN) {
                console.error('❌ MCP_AUTH_TOKEN is not set. Refusing to start the MCP WebSocket server without authentication.');
                process.exit(1);
            }
            await mcpServer.start(httpServer);
        }

        // Start HTTP Server
        httpServer.listen(config.PORT, () => {
            console.error(`🚀 Server running on port ${config.PORT}`);
            console.error(`webhook: http://localhost:${config.PORT}/webhook`);
            if (!useStdio) {
                console.error(`mcp: ws://localhost:${config.PORT}`);
            }
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

main();
