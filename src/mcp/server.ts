import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import { WebSocketServer, WebSocket, type VerifyClientCallbackSync } from 'ws';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { timingSafeEqual } from 'crypto';
import type { IncomingMessage } from 'http';
import { z } from 'zod';
import { whatsAppClient } from '../whatsapp/client.js';
import type { NormalizedIncomingMessage } from '../whatsapp/incoming.js';
import { WebSocketTransport } from './websocket-transport.js';

import { config } from '../config/env.js';

type NotificationTransport = Pick<Transport, 'send'>;

class WhatsAppMcpServer {
    private wss: WebSocketServer | null = null;
    // Every transport with a live client, WebSocket or stdio, so server
    // events can be pushed to all of them.
    private activeTransports = new Set<NotificationTransport>();

    // One McpServer per client: Protocol.connect() binds a server to a
    // single transport, so sharing one instance across connections lets a
    // new client hijack the transport (and the responses) of the previous
    // one. Each connection gets a fresh server with the same tools.
    private createMcpServer(): McpServer {
        const server = new McpServer({
            name: 'WhatsApp MCP Server',
            version: '1.0.0',
        });

        this.registerTools(server);
        return server;
    }

    private registerTools(server: McpServer) {
        server.tool(
            'send_text_message',
            {
                to: z.string().describe('The WhatsApp phone number to send the message to'),
                text: z.string().describe('The text content of the message'),
            },
            async ({ to, text }: { to: string; text: string }) => {
                const result = await whatsAppClient.sendText(to, text);
                return {
                    content: [{ type: 'text', text: JSON.stringify(result) }],
                };
            }
        );

        server.tool(
            'send_template_message',
            {
                to: z.string().describe('The WhatsApp phone number'),
                template_name: z.string().describe('Name of the template'),
                language: z.string().describe('Language code (e.g., en_US)'),
                components: z.array(z.any()).optional().describe('Template components'),
            },
            async ({ to, template_name, language, components }: { to: string; template_name: string; language: string; components?: any[] }) => {
                const result = await whatsAppClient.sendTemplate(to, template_name, language, components);
                return {
                    content: [{ type: 'text', text: JSON.stringify(result) }],
                };
            }
        );

        server.tool(
            'get_media',
            {
                media_id: z.string().describe('The ID of the media to retrieve'),
            },
            async ({ media_id }: { media_id: string }) => {
                const url = await whatsAppClient.getMediaUrl(media_id);
                return {
                    content: [{ type: 'text', text: url }],
                };
            }
        );



        server.tool(
            'health_check',
            {},
            async () => {
                const isHealthy = await whatsAppClient.healthCheck();
                return {
                    content: [{ type: 'text', text: isHealthy ? 'healthy' : 'unhealthy' }],
                    isError: !isHealthy,
                };
            }
        );
    }

    // Accepts the shared token either as an `Authorization: Bearer <token>`
    // header or as a `?token=<token>` query parameter (for MCP clients that
    // cannot set WebSocket headers). Compared in constant time.
    private isAuthorized(req: IncomingMessage): boolean {
        const expectedToken = config.MCP_AUTH_TOKEN;
        if (!expectedToken) {
            // Fail closed: never serve an unauthenticated MCP endpoint.
            return false;
        }

        let presented: string | undefined;
        const authHeader = req.headers['authorization'];
        if (authHeader?.startsWith('Bearer ')) {
            presented = authHeader.slice('Bearer '.length);
        } else {
            const url = new URL(req.url ?? '/', 'http://localhost');
            presented = url.searchParams.get('token') ?? undefined;
        }

        if (!presented) {
            return false;
        }

        const expected = Buffer.from(expectedToken);
        const candidate = Buffer.from(presented);
        return expected.length === candidate.length && timingSafeEqual(expected, candidate);
    }

    // Pushes a `whatsapp.incoming_message` notification (docs/use_case.md)
    // to every connected MCP client. Called by POST /webhook when Meta
    // delivers a customer message.
    broadcastIncomingMessage(message: NormalizedIncomingMessage): void {
        const notification: JSONRPCMessage = {
            jsonrpc: '2.0',
            method: 'notifications/message',
            params: {
                name: 'whatsapp.incoming_message',
                data: message,
            },
        };
        for (const transport of this.activeTransports) {
            Promise.resolve(transport.send(notification)).catch((error) => {
                console.error('Failed to broadcast incoming message to a client:', error);
            });
        }
    }

    async start(httpServer: any) {
        if (!config.MCP_AUTH_TOKEN) {
            throw new Error('MCP_AUTH_TOKEN is required to start the MCP WebSocket server');
        }

        this.wss = new WebSocketServer({
            server: httpServer,
            verifyClient: ((info) => this.isAuthorized(info.req)) as VerifyClientCallbackSync,
        });

        this.wss.on('connection', async (ws: WebSocket) => {
            console.error('New MCP WebSocket connection');

            const transport = new WebSocketTransport(ws);
            const server = this.createMcpServer();

            this.activeTransports.add(transport);
            ws.on('close', () => {
                this.activeTransports.delete(transport);
            });

            await server.connect(transport);
        });
    }

    async startStdio() {
        const transport = new StdioServerTransport();
        this.activeTransports.add(transport);
        const server = this.createMcpServer();
        await server.connect(transport);
        console.error('MCP Server running on stdio');
    }


}

export const mcpServer = new WhatsAppMcpServer();
