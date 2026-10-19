import dotenv from 'dotenv';
import { z } from 'zod';
import { logger } from './logger.js';

// Suppress dotenv debug output by not logging to console
dotenv.config({ quiet: true } as any);

const envSchema = z.object({
    META_WHATSAPP_TOKEN: z.string().min(1),
    META_WHATSAPP_PHONE_ID: z.string().min(1),
    META_WHATSAPP_WABA_ID: z.string().min(1),
    META_VERIFY_TOKEN: z.string().min(1),
    // App secret used to validate the X-Hub-Signature-256 header on
    // incoming webhook deliveries. Required: without it the webhook
    // cannot tell Meta's payloads from forged ones.
    META_APP_SECRET: z.string().min(1),
    // Shared secret that authenticates MCP WebSocket clients.
    // Optional in the schema so --stdio mode can run without it; the
    // WebSocket server refuses to start when it is missing.
    MCP_AUTH_TOKEN: z.string().min(1).optional(),
    // Meta Graph API version used for every WhatsApp Cloud API call.
    // Defaults to the version the integration was built against; override
    // here instead of editing code when Meta deprecates it.
    WHATSAPP_API_VERSION: z.string().default('v18.0'),
    PORT: z.string().default('4000'),
    LOG_LEVEL: z.string().default('info'),
});

const parseEnv = () => {
    try {
        return envSchema.parse(process.env);
    } catch (error) {
        if (error instanceof z.ZodError) {
            logger.error({ fields: error.flatten().fieldErrors }, '❌ Invalid environment variables');
        }
        process.exit(1);
    }
};

export const config = parseEnv();
