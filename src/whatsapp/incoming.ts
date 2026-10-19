// Normalization of Meta WhatsApp Cloud API webhook payloads.
//
// Meta delivers a nested structure (entry -> changes -> value -> messages)
// with a per-type payload (`text`, `image`, ...). MCP clients should not
// have to know that shape, so incoming customer messages are flattened here
// into the `whatsapp.incoming_message` event documented in docs/use_case.md.

export interface NormalizedIncomingMessage {
    from: string;
    id: string;
    timestamp: number;
    type: string;
    // Display name from the contacts block, when Meta includes it.
    contactName?: string;
    // Body for text messages; other types keep their raw payload under
    // their own key (`image`, `audio`, `location`, ...).
    text?: string;
    [key: string]: unknown;
}

export function normalizeIncomingMessages(payload: unknown): NormalizedIncomingMessage[] {
    const normalized: NormalizedIncomingMessage[] = [];
    if (!payload || typeof payload !== 'object') {
        return normalized;
    }

    const entries = (payload as any).entry;
    if (!Array.isArray(entries)) {
        return normalized;
    }

    for (const entry of entries) {
        const changes = entry?.changes;
        if (!Array.isArray(changes)) {
            continue;
        }
        for (const change of changes) {
            if (change?.field !== 'messages') {
                continue;
            }
            const value = change.value;
            const contactName: string | undefined = value?.contacts?.[0]?.profile?.name;
            const messages = value?.messages;
            // Delivery/read receipts arrive in the same change as
            // `statuses` (without `messages`) and are not customer input.
            if (!Array.isArray(messages)) {
                continue;
            }
            for (const message of messages) {
                if (!message?.from || !message?.id || !message?.type) {
                    continue;
                }
                const item: NormalizedIncomingMessage = {
                    from: message.from,
                    id: message.id,
                    timestamp: Number(message.timestamp),
                    type: message.type,
                };
                if (contactName) {
                    item.contactName = contactName;
                }
                if (message.type === 'text' && typeof message.text?.body === 'string') {
                    item.text = message.text.body;
                } else if (message[message.type] !== undefined) {
                    item[message.type] = message[message.type];
                }
                normalized.push(item);
            }
        }
    }

    return normalized;
}
