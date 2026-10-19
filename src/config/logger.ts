import dotenv from 'dotenv';
import pino from 'pino';

// Load .env before reading LOG_LEVEL so the level configured there applies.
dotenv.config({ quiet: true } as any);

// Writes to stderr (fd 2): in --stdio mode stdout carries the MCP JSON-RPC
// stream, so logs must never go there.
export const logger = pino(
    {
        level: process.env.LOG_LEVEL ?? 'info',
    },
    pino.destination(2),
);
