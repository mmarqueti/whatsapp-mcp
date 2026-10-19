import axios, { AxiosInstance } from 'axios';
import { config } from '../config/env.js';
import { logger } from '../config/logger.js';

export class WhatsAppClient {
    private client: AxiosInstance;

    constructor() {
        this.client = axios.create({
            baseURL: `https://graph.facebook.com/${config.WHATSAPP_API_VERSION}`,
            headers: {
                'Authorization': `Bearer ${config.META_WHATSAPP_TOKEN}`,
                'Content-Type': 'application/json',
            },
        });
    }

    async sendText(to: string, text: string) {
        try {
            const response = await this.client.post(`/${config.META_WHATSAPP_PHONE_ID}/messages`, {
                messaging_product: 'whatsapp',
                recipient_type: 'individual',
                to,
                type: 'text',
                text: { body: text },
            });
            return response.data;
        } catch (error: any) {
            logger.error({ err: error.response?.data || error.message }, 'Error sending text message');
            throw error;
        }
    }

    async sendTemplate(to: string, templateName: string, language: string, components: any[] = []) {
        try {
            const response = await this.client.post(`/${config.META_WHATSAPP_PHONE_ID}/messages`, {
                messaging_product: 'whatsapp',
                recipient_type: 'individual',
                to,
                type: 'template',
                template: {
                    name: templateName,
                    language: { code: language },
                    components,
                },
            });
            return response.data;
        } catch (error: any) {
            logger.error({ err: error.response?.data || error.message }, 'Error sending template message');
            throw error;
        }
    }

    async getMediaUrl(mediaId: string): Promise<string> {
        try {
            const response = await this.client.get(`/${mediaId}`);
            return response.data.url;
        } catch (error: any) {
            logger.error({ err: error.response?.data || error.message }, 'Error getting media URL');
            throw error;
        }
    }

    async healthCheck(): Promise<boolean> {
        try {
            await this.client.get(`/${config.META_WHATSAPP_PHONE_ID}`);
            return true;
        } catch (error: any) {
            logger.error({ err: error.response?.data || error.message }, 'Health check failed');
            return false;
        }
    }
}

export const whatsAppClient = new WhatsAppClient();
