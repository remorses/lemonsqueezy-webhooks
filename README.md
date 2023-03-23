## Install

```
npm i lemonsqueezy-webhooks
```

This package exposes the Lemon-squeezy webhooks types and an utility function to handle webhooks in Node.js

Exported types:

-   X

Exported functions

-   `nodejsWebHookHandler`, it handles webhooks signature check and parsing

## Usage in Node.js

```ts
const secret = process.env.LEMON_SQUEEZY_WEBHOOK_SECRET!

// ... Express app setup

app.post('/webhooks', async (req, res) => {
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
