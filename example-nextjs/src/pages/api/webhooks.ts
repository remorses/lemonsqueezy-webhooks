import type { NextApiResponse, NextApiRequest } from 'next'
import { nodejsWebHookHandler } from 'lemonsqueezy-webhooks'

export const config = {
    api: {
        // important!
        bodyParser: false,
    },
}

const secret = process.env.SECRET!

if (!secret) {
    throw new Error('SECRET is not set')
}

export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse,
) {
    await nodejsWebHookHandler({
        onData(payload) {
            console.log(payload)
            if (payload.event_name === 'order_created') {
                // payload.data is an Order
                console.log(payload.data.attributes.status)
            }
        },
        req,
        res,
        secret,
    })
}
