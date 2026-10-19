import express from 'express';
import { config } from '../config/env.js';
import { mcpServer } from '../mcp/server.js';
import { normalizeIncomingMessages } from './incoming.js';
import { requireValidSignature } from './signature.js';
import { logger } from '../config/logger.js';


const router = express.Router();

// Verification endpoint
router.get('/', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode && token) {
        if (mode === 'subscribe' && token === config.META_VERIFY_TOKEN) {
            logger.info('WEBHOOK_VERIFIED');
            res.status(200).send(challenge);
        } else {
            res.sendStatus(403);
        }
    } else {
        res.sendStatus(400);
    }
});

// Incoming messages (and statuses) from Meta. The X-Hub-Signature-256
// header is validated first so forged payloads never reach the broadcast;
// unsigned or badly signed requests get a 401.
// Meta retries delivery until it gets a 2xx, so valid payloads are acked
// first and processed afterwards; a malformed payload must not turn into
// retries.
router.post('/', requireValidSignature(config.META_APP_SECRET), (req, res) => {
    res.sendStatus(200);

    try {
        const messages = normalizeIncomingMessages(req.body);
        for (const message of messages) {
            mcpServer.broadcastIncomingMessage(message);
        }
    } catch (error) {
        logger.error({ err: error }, 'Failed to process incoming webhook payload');
    }
});



export const webhookRouter = router;
