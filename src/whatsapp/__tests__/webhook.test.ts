import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { webhookRouter } from '../webhook.js';
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
        PORT: 4000
    }
}));



const app = express();
app.use(express.json());
app.use('/webhook', webhookRouter);

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
            const response = await request(app).post('/webhook').send(textPayload);

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

            const response = await request(app).post('/webhook').send(payload);

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

            const response = await request(app).post('/webhook').send(payload);

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

            const response = await request(app).post('/webhook').send(payload);

            expect(response.status).toBe(200);
            expect(mocks.broadcastIncomingMessage).not.toHaveBeenCalled();
        });

        it('acks malformed payloads without broadcasting', async () => {
            const response = await request(app).post('/webhook').send({ unexpected: true });

            expect(response.status).toBe(200);
            expect(mocks.broadcastIncomingMessage).not.toHaveBeenCalled();
        });
    });

});
