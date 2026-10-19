import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebSocketServer, WebSocket, type VerifyClientCallbackSync } from 'ws';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { timingSafeEqual } from 'crypto';
import type { IncomingMessage } from 'http';
import { z } from 'zod';
import { whatsAppClient } from '../whatsapp/client.js';

import { config } from '../config/env.js';

class WhatsAppMcpServer {
    private server: McpServer;
    private wss: WebSocketServer | null = null;

    constructor() {
        this.server = new McpServer({
            name: 'WhatsApp MCP Server',
            version: '1.0.0',
        });

        this.registerTools();
    }

    private registerTools() {
        this.server.tool(
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

        this.server.tool(
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

        this.server.tool(
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



        this.server.tool(
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

            // Minimal Transport implementation for WebSocket
            const transport = {
                start: async () => { },
                send: async (message: any) => {
                    if (ws.readyState === ws.OPEN) {
                        ws.send(JSON.stringify(message));
                    }
                },
                close: async () => {
                    ws.close();
                },
                onclose: undefined as any,
                onerror: undefined as any,
                onmessage: undefined as any,
            };

            ws.on('message', (data: any) => {
                try {
                    const message = JSON.parse(data.toString());
                    if (transport.onmessage) {
                        transport.onmessage(message);
                    }
                } catch (error) {
                    console.error('Failed to parse message:', error);
                }
            });

            ws.on('close', () => {
                if (transport.onclose) {
                    transport.onclose();
                }
            });

            ws.on('error', (error: any) => {
                console.error('WebSocket error:', error);
                if (transport.onerror) {
                    transport.onerror(error);
                }
            });

            // @ts-ignore - McpServer.connect expects a Transport interface which matches our object structure
            await this.server.connect(transport);
        });
    }

    async startStdio() {
        const transport = new StdioServerTransport();
        await this.server.connect(transport);
        console.error('MCP Server running on stdio');
    }


}

export const mcpServer = new WhatsAppMcpServer();
