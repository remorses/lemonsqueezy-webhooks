export * from './types'
import crypto from 'crypto'
import type { Readable } from 'stream'
import type { IncomingMessage, ServerResponse } from 'http'
import { DiscriminatedWebhookPayload, WebhookPayload } from './types'

export async function nodejsWebHookHandler<CustomData = any>({
    secret,
    req,
    res,
    onData,
    onError = console.error,
}: {
    secret: string
    req: IncomingMessage
    onData: (data: DiscriminatedWebhookPayload<CustomData>) => any
    res: ServerResponse
    onError?: (error: Error) => any
}) {
    const signingSecret = secret

    if (req.method !== 'POST') {
        // you can see whether a webhook delivers successfully in your Lemon Squeezy account
        // -> Settings -> Webhooks -> Recent deliveries
        await onError(
            new Error(
                'Method not allowed for lemonsqueezy webhook ' + req.method,
            ),
        )
        return res
            .writeHead(405, { 'Content-Type': 'application/json' })
            .end(JSON.stringify({ message: 'Method not allowed' }))
    }

    try {
        // check that the request really came from Lemon Squeezy and is about this order
        const rawBody = (await buffer(req)).toString('utf-8')
        const hmac = crypto.createHmac('sha256', signingSecret)
        const digest = Buffer.from(hmac.update(rawBody).digest('hex'), 'utf8')
        const signature = Buffer.from(
            req.headers['x-signature'] as string,
            'utf8',
        )

        if (!crypto.timingSafeEqual(digest, signature)) {
            await onError(new Error('Invalid lemonsqueezy signature.'))
            return res
                .writeHead(401, { 'Content-Type': 'application/json' })
                .end(JSON.stringify({ message: 'Invalid signature.' }))
        }

        const payload: WebhookPayload = JSON.parse(rawBody)

        const eventName = payload.meta.event_name
        const customData = payload.meta.custom_data

        await onData({ event_name: eventName, ...payload } as any)
        res.writeHead(200, { 'Content-Type': 'application/json' }).end(
            JSON.stringify({ message: 'Webhook received' }),
        )
    } catch (e: any) {
        await onError(e)
        return res
            .writeHead(400, { 'Content-Type': 'application/json' })
            .end(JSON.stringify({ message: `Webhook error: ${e}` }))
    }
}

async function buffer(readable: Readable) {
    const chunks: any[] = []
    for await (const chunk of readable) {
        chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
    }
    return Buffer.concat(chunks)
}
