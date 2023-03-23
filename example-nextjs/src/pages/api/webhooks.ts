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

            if (
                payload.event_name === 'order_created' ||
                payload.event_name === 'order_refunded'
            ) {
                // upsert order in database
            } else if (
                payload.event_name === 'subscription_created' ||
                payload.event_name === 'subscription_cancelled' ||
                payload.event_name === 'subscription_expired' ||
                payload.event_name === 'subscription_paused' ||
                payload.event_name === 'subscription_resumed' ||
                payload.event_name === 'subscription_unpaused'
            ) {
                let sub = payload.data
                // upsert subscription in database
            } else if (payload.event_name === 'license_key_created') {
                // upsert license key in database
            } else if (
                payload.event_name === 'subscription_payment_success' ||
                payload.event_name === 'subscription_payment_failed' ||
                payload.event_name === 'subscription_payment_recovered'
            ) {
                // do something when a subscription payment is successful, failed or recovered
            }
        },
        req,
        res,
        secret,
    })
}
