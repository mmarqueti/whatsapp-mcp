import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { JSONRPCMessage, MessageExtraInfo } from '@modelcontextprotocol/sdk/types.js';
import type { WebSocket } from 'ws';
import { logger } from '../config/logger.js';

// MCP Transport over an already-connected WebSocket. Fully typed against the
// SDK's Transport interface (no @ts-ignore), so an SDK upgrade that changes
// the contract fails at compile time instead of silently breaking at runtime.
export class WebSocketTransport implements Transport {
    onclose?: () => void;
    onerror?: (error: Error) => void;
    onmessage?: <T extends JSONRPCMessage>(message: T, extra?: MessageExtraInfo) => void;

    constructor(private readonly ws: WebSocket) {
        ws.on('message', (data: WebSocket.RawData) => {
            try {
                const message = JSON.parse(data.toString()) as JSONRPCMessage;
                this.onmessage?.(message);
            } catch (error) {
                logger.error({ err: error }, 'Failed to parse message');
                this.onerror?.(error instanceof Error ? error : new Error(String(error)));
            }
        });

        ws.on('close', () => {
            this.onclose?.();
        });

        ws.on('error', (error: Error) => {
            logger.error({ err: error }, 'WebSocket error');
            this.onerror?.(error);
        });
    }

    async start(): Promise<void> {
        // The socket is already open when the 'connection' event fires, so
        // there is nothing to negotiate here.
    }

    async send(message: JSONRPCMessage): Promise<void> {
        if (this.ws.readyState === this.ws.OPEN) {
            this.ws.send(JSON.stringify(message));
        }
    }

    async close(): Promise<void> {
        this.ws.close();
    }
}
