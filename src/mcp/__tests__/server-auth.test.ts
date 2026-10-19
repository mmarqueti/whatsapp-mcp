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

function tryConnect(url: string, headers?: Record<string, string>): Promise<'open' | 'rejected'> {
    return new Promise((resolve) => {
        const ws = new WebSocket(url, { headers });
        ws.on('open', () => {
            ws.close();
            resolve('open');
        });
        ws.on('error', () => resolve('rejected'));
        ws.on('unexpected-response', () => resolve('rejected'));
    });
}

describe('MCP WebSocket authentication', () => {
    it('rejects connections without a token', async () => {
        expect(await tryConnect(`ws://127.0.0.1:${port}`)).toBe('rejected');
    });

    it('rejects connections with a wrong token', async () => {
        expect(await tryConnect(`ws://127.0.0.1:${port}/?token=wrong-token`)).toBe('rejected');
        expect(await tryConnect(`ws://127.0.0.1:${port}`, { Authorization: 'Bearer wrong-token' })).toBe('rejected');
    });

    it('accepts connections with the right token as a query param', async () => {
        expect(await tryConnect(`ws://127.0.0.1:${port}/?token=secret-token`)).toBe('open');
    });

    it('accepts connections with the right token as a Bearer header', async () => {
        expect(await tryConnect(`ws://127.0.0.1:${port}`, { Authorization: 'Bearer secret-token' })).toBe('open');
    });
});
