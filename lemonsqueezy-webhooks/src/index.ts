export * from './types'
import crypto from 'crypto'
import type { Readable } from 'stream'
import type { IncomingMessage, ServerResponse } from 'http'
import { DiscriminatedWebhookPayload, WebhookPayload } from './types'

async function buffer(readable: Readable) {
    const chunks: any[] = []
    for await (const chunk of readable) {
        chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
    }
    return Buffer.concat(chunks)
}

export async function nodejsWebHookHandler({
    secret,
    req,
    res,
    onData,
}: {
    secret: string
    req: IncomingMessage
    onData: (data: DiscriminatedWebhookPayload) => any
    res: ServerResponse
}) {
    const signingSecret = secret

    if (req.method !== 'POST') {
        // you can see whether a webhook delivers successfully in your Lemon Squeezy account
        // -> Settings -> Webhooks -> Recent deliveries
        console.log('Method not allowed', req.method)
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
            console.log('Invalid signature.')
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
        return res
            .writeHead(400, { 'Content-Type': 'application/json' })
            .end(JSON.stringify({ message: `Webhook error: ${e}` }))
    }
}
