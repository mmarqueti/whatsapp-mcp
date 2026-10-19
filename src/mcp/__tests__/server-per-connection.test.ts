import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import express from 'express';
import { createServer } from 'http';
import type { Server } from 'http';
import WebSocket from 'ws';

// Mock config before importing the MCP server (which reads config at import time).
vi.mock('../../config/env.js', () => ({
    config: {
        META_VERIFY_TOKEN: 'test-token',
        META_WHATSAPP_TOKEN: 'test-token',
        META_WHATSAPP_PHONE_ID: 'test-phone-id',
        META_WHATSAPP_WABA_ID: 'test-waba-id',
        MCP_AUTH_TOKEN: 'secret-token',
        PORT: '4000',
    },
}));

import { mcpServer } from '../server.js';

let httpServer: Server;
let port: number;

beforeAll(async () => {
    const app = express();
    httpServer = createServer(app);
    await mcpServer.start(httpServer);
    await new Promise<void>((resolve) => httpServer.listen(0, resolve));
    const address = httpServer.address();
    port = typeof address === 'object' && address ? address.port : 0;
});

afterAll(async () => {
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
});

function connectClient(): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
        const ws = new WebSocket(`ws://127.0.0.1:${port}/?token=secret-token`);
        ws.on('open', () => resolve(ws));
        ws.on('error', reject);
    });
}

function sendRpc(ws: WebSocket, message: Record<string, unknown>): Promise<any> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`timed out waiting for response to id ${message.id}`)), 3000);
        const listener = (data: WebSocket.RawData) => {
            const parsed = JSON.parse(data.toString());
            if (parsed.id === message.id) {
                clearTimeout(timer);
                ws.off('message', listener);
                resolve(parsed);
            }
        };
        ws.on('message', listener);
        ws.send(JSON.stringify(message));
    });
}

function initializeRequest(id: number) {
    return {
        jsonrpc: '2.0',
        id,
        method: 'initialize',
        params: {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'vitest', version: '0.0.1' },
        },
    };
}

describe('per-connection MCP server', () => {
    it('keeps each WebSocket client bound to its own server and transport', async () => {
        const clientA = await connectClient();

        // Client A initializes while it is the only connection.
        const initA = await sendRpc(clientA, initializeRequest(1));
        expect(initA.result?.serverInfo?.name).toBe('WhatsApp MCP Server');
        clientA.send(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }));

        // Client B connects and initializes. With a shared McpServer this
        // re-bind would hijack the transport client A is answered on.
        const clientB = await connectClient();
        const initB = await sendRpc(clientB, initializeRequest(2));
        expect(initB.result?.serverInfo?.name).toBe('WhatsApp MCP Server');
        clientB.send(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }));

        // A request from A must be answered on A's socket, not B's.
        const responsePromise = sendRpc(clientA, { jsonrpc: '2.0', id: 3, method: 'tools/list', params: {} });
        const strayOnB = new Promise((resolve) => {
            const listener = (data: WebSocket.RawData) => {
                const parsed = JSON.parse(data.toString());
                if (parsed.id === 3) {
                    resolve('hijacked');
                }
            };
            clientB.on('message', listener);
            setTimeout(() => {
                clientB.off('message', listener);
                resolve('silent');
            }, 1000);
        });

        const response = await responsePromise;
        expect(response.result?.tools?.length).toBeGreaterThan(0);
        expect(await strayOnB).toBe('silent');

        clientA.close();
        clientB.close();
    });

    it('broadcasts an incoming message to every connected client', async () => {
        const clientA = await connectClient();
        const clientB = await connectClient();

        const notificationOn = (ws: WebSocket) => new Promise<any>((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('timed out waiting for notifications/message')), 3000);
            ws.on('message', (data) => {
                const parsed = JSON.parse(data.toString());
                if (parsed.method === 'notifications/message') {
                    clearTimeout(timer);
                    resolve(parsed);
                }
            });
        });

        const [notificationA, notificationB] = await Promise.all([
            notificationOn(clientA),
            notificationOn(clientB),
            Promise.resolve().then(() => mcpServer.broadcastIncomingMessage({
                from: '1555123456',
                id: 'wamid.HBgLM...',
                timestamp: 1715623400,
                type: 'text',
                text: 'Hi!',
            })),
        ]);

        expect(notificationA.params?.name).toBe('whatsapp.incoming_message');
        expect(notificationB.params?.name).toBe('whatsapp.incoming_message');

        clientA.close();
        clientB.close();
    });
});
