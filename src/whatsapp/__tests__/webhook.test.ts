import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHmac } from 'crypto';
import request from 'supertest';
import express from 'express';
import { webhookRouter } from '../webhook.js';
import { captureRawBody } from '../signature.js';
import { config } from '../../config/env.js';


// Capture broadcasts instead of starting a real MCP server.
const mocks = vi.hoisted(() => ({
    broadcastIncomingMessage: vi.fn(),
}));

vi.mock('../../mcp/server.js', () => ({
    mcpServer: {
        broadcastIncomingMessage: mocks.broadcastIncomingMessage,
    },
}));

// Mock config
vi.mock('../../config/env.js', () => ({
    config: {
        META_VERIFY_TOKEN: 'test-token',
        META_WHATSAPP_TOKEN: 'test-token',
        META_WHATSAPP_PHONE_ID: 'test-phone-id',
        META_APP_SECRET: 'test-app-secret',
        PORT: 4000
    }
}));



const app = express();
app.use(express.json({ verify: captureRawBody }));
app.use('/webhook', webhookRouter);

// Sign a payload exactly as Meta would: HMAC-SHA256 over the raw JSON body.
const APP_SECRET = 'test-app-secret';
function sign(rawBody: string, secret = APP_SECRET): string {
    return 'sha256=' + createHmac('sha256', secret).update(rawBody).digest('hex');
}

function postSigned(path: string, payload: unknown) {
    const rawBody = JSON.stringify(payload);
    return request(app)
        .post(path)
        .set('Content-Type', 'application/json')
        .set('X-Hub-Signature-256', sign(rawBody))
        .send(rawBody);
}

describe('Webhook Integration', () => {
    beforeEach(() => {
        mocks.broadcastIncomingMessage.mockClear();
    });

    describe('GET /webhook', () => {
        it('should verify token correctly', async () => {
            const response = await request(app)
                .get('/webhook')
                .query({
                    'hub.mode': 'subscribe',
                    'hub.verify_token': 'test-token',
                    'hub.challenge': '12345'
                });

            expect(response.status).toBe(200);
            expect(response.text).toBe('12345');
        });

        it('should reject invalid token', async () => {
            const response = await request(app)
                .get('/webhook')
                .query({
                    'hub.mode': 'subscribe',
                    'hub.verify_token': 'wrong-token',
                    'hub.challenge': '12345'
                });

            expect(response.status).toBe(403);
        });

        it('should reject missing params', async () => {
            const response = await request(app)
                .get('/webhook');

            expect(response.status).toBe(400);
        });
    });

    describe('POST /webhook', () => {
        const textPayload = {
            object: 'whatsapp_business_account',
            entry: [{
                id: '1234567890',
                changes: [{
                    field: 'messages',
                    value: {
                        messaging_product: 'whatsapp',
                        metadata: { display_phone_number: '1555000111', phone_number_id: 'test-phone-id' },
                        contacts: [{ profile: { name: 'John Doe' }, wa_id: '1555123456' }],
                        messages: [{
                            from: '1555123456',
                            id: 'wamid.HBgLM...',
                            timestamp: '1715623400',
                            type: 'text',
                            text: { body: 'Hi, is my order #1234 ready?' },
                        }],
                    },
                }],
            }],
        };

        it('acks and broadcasts a normalized text message', async () => {
            const response = await postSigned('/webhook', textPayload);

            expect(response.status).toBe(200);
            expect(mocks.broadcastIncomingMessage).toHaveBeenCalledTimes(1);
            expect(mocks.broadcastIncomingMessage).toHaveBeenCalledWith({
                from: '1555123456',
                id: 'wamid.HBgLM...',
                timestamp: 1715623400,
                type: 'text',
                contactName: 'John Doe',
                text: 'Hi, is my order #1234 ready?',
            });
        });

        it('broadcasts media messages with their raw payload', async () => {
            const payload = JSON.parse(JSON.stringify(textPayload));
            payload.entry[0].changes[0].value.messages = [{
                from: '1555123456',
                id: 'wamid.IMG',
                timestamp: '1715623401',
                type: 'image',
                image: { id: '987654321', mime_type: 'image/jpeg' },
            }];

            const response = await postSigned('/webhook', payload);

            expect(response.status).toBe(200);
            expect(mocks.broadcastIncomingMessage).toHaveBeenCalledTimes(1);
            expect(mocks.broadcastIncomingMessage).toHaveBeenCalledWith({
                from: '1555123456',
                id: 'wamid.IMG',
                timestamp: 1715623401,
                type: 'image',
                contactName: 'John Doe',
                image: { id: '987654321', mime_type: 'image/jpeg' },
            });
        });

        it('broadcasts every message in a batched payload', async () => {
            const payload = JSON.parse(JSON.stringify(textPayload));
            const second = { ...textPayload.entry[0].changes[0].value.messages[0], id: 'wamid.SECOND' };
            payload.entry[0].changes[0].value.messages.push(second);

            const response = await postSigned('/webhook', payload);

            expect(response.status).toBe(200);
            expect(mocks.broadcastIncomingMessage).toHaveBeenCalledTimes(2);
        });

        it('acks delivery receipts without broadcasting', async () => {
            const payload = {
                object: 'whatsapp_business_account',
                entry: [{
                    id: '1234567890',
                    changes: [{
                        field: 'messages',
                        value: {
                            messaging_product: 'whatsapp',
                            metadata: { display_phone_number: '1555000111', phone_number_id: 'test-phone-id' },
                            statuses: [{ id: 'wamid.HBgLM...', status: 'delivered', timestamp: '1715623402' }],
                        },
                    }],
                }],
            };

            const response = await postSigned('/webhook', payload);

            expect(response.status).toBe(200);
            expect(mocks.broadcastIncomingMessage).not.toHaveBeenCalled();
        });

        it('acks malformed payloads without broadcasting', async () => {
            const response = await postSigned('/webhook', { unexpected: true });

            expect(response.status).toBe(200);
            expect(mocks.broadcastIncomingMessage).not.toHaveBeenCalled();
        });

        it('rejects requests without a signature header', async () => {
            const response = await request(app).post('/webhook').send(textPayload);

            expect(response.status).toBe(401);
            expect(mocks.broadcastIncomingMessage).not.toHaveBeenCalled();
        });

        it('rejects requests signed with the wrong secret', async () => {
            const rawBody = JSON.stringify(textPayload);
            const response = await request(app)
                .post('/webhook')
                .set('Content-Type', 'application/json')
                .set('X-Hub-Signature-256', sign(rawBody, 'not-the-app-secret'))
                .send(rawBody);

            expect(response.status).toBe(401);
            expect(mocks.broadcastIncomingMessage).not.toHaveBeenCalled();
        });

        it('rejects requests with a malformed signature header', async () => {
            const rawBody = JSON.stringify(textPayload);
            const response = await request(app)
                .post('/webhook')
                .set('Content-Type', 'application/json')
                .set('X-Hub-Signature-256', 'not-a-valid-header')
                .send(rawBody);

            expect(response.status).toBe(401);
            expect(mocks.broadcastIncomingMessage).not.toHaveBeenCalled();
        });

        it('rejects a signature computed over a different body', async () => {
            const response = await request(app)
                .post('/webhook')
                .set('Content-Type', 'application/json')
                .set('X-Hub-Signature-256', sign(JSON.stringify({ forged: true })))
                .send(JSON.stringify(textPayload));

            expect(response.status).toBe(401);
            expect(mocks.broadcastIncomingMessage).not.toHaveBeenCalled();
        });
    });

});
