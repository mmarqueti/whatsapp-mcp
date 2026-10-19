// Validation of Meta's X-Hub-Signature-256 webhook signature.
//
// Meta signs every webhook delivery with HMAC-SHA256 over the raw request
// body, keyed by the app secret, and sends it as
// `X-Hub-Signature-256: sha256=<hex digest>`. The signature must be checked
// before the payload is trusted: without it anyone who discovers the
// webhook URL could inject fake incoming messages.

import { createHmac, timingSafeEqual } from 'crypto';
import type { Request, Response, NextFunction } from 'express';

declare global {
    // eslint-disable-next-line @typescript-eslint/no-namespace
    namespace Express {
        interface Request {
            // Raw request body captured by `captureRawBody` (needed because
            // the HMAC is computed over the exact bytes, not the parsed
            // JSON).
            rawBody?: Buffer;
        }
    }
}

// `verify` callback for express.json(): keeps a copy of the raw body buffer
// on the request so the signature can be validated later.
export function captureRawBody(req: Request, _res: Response, buf: Buffer): void {
    req.rawBody = buf;
}

export function isValidSignature(
    rawBody: Buffer | undefined,
    signatureHeader: string | undefined,
    appSecret: string,
): boolean {
    // Fail closed: without a raw body or a signature header there is
    // nothing trustworthy to validate against.
    if (!rawBody || !signatureHeader) {
        return false;
    }

    const match = /^sha256=([0-9a-f]{64})$/i.exec(signatureHeader.trim());
    if (!match) {
        return false;
    }

    const expected = createHmac('sha256', appSecret).update(rawBody).digest();
    const received = Buffer.from(match[1], 'hex');
    return timingSafeEqual(expected, received);
}

// Express middleware that rejects unsigned or badly signed webhook
// deliveries with 401. Meta only retries on non-2xx for *its own*
// deliveries; forged requests get nothing back.
export function requireValidSignature(appSecret: string) {
    return (req: Request, res: Response, next: NextFunction): void => {
        if (!isValidSignature(req.rawBody, req.get('x-hub-signature-256'), appSecret)) {
            res.sendStatus(401);
            return;
        }
        next();
    };
}
