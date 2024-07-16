export * from './types'
import crypto from 'crypto'

import type { IncomingMessage, ServerResponse } from 'http'
import { DiscriminatedWebhookPayload, WebhookPayload } from './types'
import { Readable } from 'stream'

async function incomingMessageToRequest(incomingMessage: IncomingMessage) {
    const { method, url, headers } = incomingMessage

    const body =
        incomingMessage.method !== 'GET' && incomingMessage.method !== 'HEAD'
            ? await Readable.toWeb(incomingMessage)
            : null

    return new Request(
        new URL(url || '/', 'http://' + incomingMessage.headers.host),
        {
            method,
            headers: new Headers(headers as Record<string, string>),
            body: body as ReadableStream<any>,
            // @ts-ignore
            duplex: 'half',
        },
    )
}

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
    const request = await incomingMessageToRequest(req)
    const response = await whatwgWebhooksHandler({
        secret,
        request,
        onData,
        onError,
    })

    for (const [key, value] of Object.entries(response.headers)) {
        res.setHeader(key, value)
    }
    res.statusCode = response.status
    res.end(await response.text())
}

export async function whatwgWebhooksHandler<CustomData = any>({
    secret,
    request,
    onData,
    onError = console.error,
}: {
    secret: string
    request: Request
    onData: (data: DiscriminatedWebhookPayload<CustomData>) => any
    onError?: (error: Error) => any
}) {
    const signingSecret = secret

    if (request.method !== 'POST') {
        // you can see whether a webhook delivers successfully in your Lemon Squeezy account
        // -> Settings -> Webhooks -> Recent deliveries
        await onError(
            new Error(
                'Method not allowed for lemonsqueezy webhook ' + request.method,
            ),
        )
        return new Response(JSON.stringify({ message: 'Method not allowed' }), {
            status: 405,
            headers: { 'Content-Type': 'application/json' },
        })
    }

    try {
        // check that the request really came from Lemon Squeezy and is about this order
        const rawBody = await request.text()
        const hmac = crypto.createHmac('sha256', signingSecret)
        const digest = Buffer.from(hmac.update(rawBody).digest('hex'), 'utf8')
        const signature = Buffer.from(
            request.headers.get('x-signature') || '',
            'utf8',
        )

        if (!crypto.timingSafeEqual(digest, signature)) {
            await onError(new Error('Invalid lemonsqueezy signature.'))
            return new Response(
                JSON.stringify({ message: 'Invalid signature.' }),
                {
                    status: 401,
                    headers: { 'Content-Type': 'application/json' },
                },
            )
        }

        const payload: WebhookPayload = JSON.parse(rawBody)

        const eventName = payload.meta.event_name
        const customData = payload.meta.custom_data

        await onData({ event_name: eventName, ...payload } as any)
        return new Response(JSON.stringify({ message: 'Webhook received' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        })
    } catch (e: any) {
        await onError(e)
        return new Response(
            JSON.stringify({ message: `Webhook error: ${e}` }),
            {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
            },
        )
    }
}

// async function buffer(readable: Readable) {
//     const chunks: any[] = []
//     for await (const chunk of readable) {
//         chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
//     }
//     return Buffer.concat(chunks)
// }
