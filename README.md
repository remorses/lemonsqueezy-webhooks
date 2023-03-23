## Install

```
npm i lemonsqueezy-webhooks
```

This package exposes the Lemon-squeezy webhooks types and an utility function to handle webhooks in Node.js

Exported types:

-   `WebhookPayload`, the lemonsqueezy json body of a webhook
-   `Order`, the `payload.data` type for the events `order_created`, `order_updated`, `order_deleted`
-   `Subscription`, the `payload.data` type for the events `subscription_created`, `subscription_cancelled`, `subscription_resumed`, `subscription_expired`, `subscription_paused`, `subscription_unpaused`
-   `SubscriptionInvoice`, the `payload.data` type for the events `subscription_payment_success`, `subscription_payment_failed`, `subscription_payment_recovered`
-   `LicenseKey`, the `payload.data` type for the events `license_key_created`

Exported functions

-   `nodejsWebHookHandler`, it handles webhooks signature check and parsing. It also adds a top level `event_name` field to the payload to make [Typescript discriminated unions](https://www.typescriptlang.org/docs/handbook/unions-and-intersections.html#discriminating-unions) work and infer the payload.data type under if blocks inside `onData`.

## Usage in Node.js

```ts
const secret = process.env.LEMON_SQUEEZY_WEBHOOK_SECRET!

// ... Express app setup

app.post('/webhooks', async (req, res) => {
    await nodejsWebHookHandler({
        onData(payload) {
            console.log(payload)
            // payload.event_name allows TypeScript to infer the type of payload.data
            if (payload.event_name === 'order_created') {
                // payload.data is an Order
                console.log(payload.data.attributes.status)
            }
        },
        req,
        res,
        secret,
    })
})
```

## Usage in Next.js (with Node runtime)

You can also see the source code in the Next.js app example in this repo for a full example.

```ts
// api/webhook.ts
import type { NextApiResponse, NextApiRequest } from 'next'
import { nodejsWebHookHandler } from 'lemonsqueezy-webhooks'

export const config = {
    api: {
        // important! otherwise the body signature check will fail
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
```
