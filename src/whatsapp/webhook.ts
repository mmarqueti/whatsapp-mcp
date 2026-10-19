import express from 'express';
import { config } from '../config/env.js';
import { mcpServer } from '../mcp/server.js';
import { normalizeIncomingMessages } from './incoming.js';


const router = express.Router();

// Verification endpoint
router.get('/', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode && token) {
        if (mode === 'subscribe' && token === config.META_VERIFY_TOKEN) {
            console.log('WEBHOOK_VERIFIED');
            res.status(200).send(challenge);
        } else {
            res.sendStatus(403);
        }
    } else {
        res.sendStatus(400);
    }
});

// Incoming messages (and statuses) from Meta.
// Meta retries delivery until it gets a 2xx, so always ack first and
// process afterwards; a malformed payload must not turn into retries.
router.post('/', (req, res) => {
    res.sendStatus(200);

    try {
        const messages = normalizeIncomingMessages(req.body);
        for (const message of messages) {
            mcpServer.broadcastIncomingMessage(message);
        }
    } catch (error) {
        console.error('Failed to process incoming webhook payload:', error);
    }
});



export const webhookRouter = router;
