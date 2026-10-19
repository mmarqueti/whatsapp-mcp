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

function waitForNotification(ws: WebSocket, method: string, timeoutMs = 3000): Promise<any> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`timed out waiting for ${method}`)), timeoutMs);
        ws.on('message', (data) => {
            const message = JSON.parse(data.toString());
            if (message.method === method) {
                clearTimeout(timer);
                resolve(message);
            }
        });
    });
}

describe('whatsapp.incoming_message broadcast', () => {
    it('pushes the notification to connected MCP WebSocket clients', async () => {
        const ws = new WebSocket(`ws://127.0.0.1:${port}/?token=secret-token`);
        await new Promise<void>((resolve, reject) => {
            ws.on('open', () => resolve());
            ws.on('error', reject);
        });

        const notificationPromise = waitForNotification(ws, 'notifications/message');

        mcpServer.broadcastIncomingMessage({
            from: '1555123456',
            id: 'wamid.HBgLM...',
            timestamp: 1715623400,
            type: 'text',
            contactName: 'John Doe',
            text: 'Hi, is my order #1234 ready?',
        });

        const notification = await notificationPromise;
        expect(notification.jsonrpc).toBe('2.0');
        expect(notification.params).toEqual({
            name: 'whatsapp.incoming_message',
            data: {
                from: '1555123456',
                id: 'wamid.HBgLM...',
                timestamp: 1715623400,
                type: 'text',
                contactName: 'John Doe',
                text: 'Hi, is my order #1234 ready?',
            },
        });

        ws.close();
    });

    it('does not throw when no client is connected', () => {
        expect(() => mcpServer.broadcastIncomingMessage({
            from: '1555123456',
            id: 'wamid.EMPTY',
            timestamp: 1715623400,
            type: 'text',
            text: 'nobody listening',
        })).not.toThrow();
    });
});
