import crypto from 'crypto'
import { describe, expect, test } from 'vitest'

import { whatwgWebhooksHandler } from './index'

const secret = 'test-webhook-secret'

function sign(body: string) {
    return crypto.createHmac('sha256', secret).update(body).digest('hex')
}

function post(body: string, signature?: string) {
    const headers = new Headers({ 'content-type': 'application/json' })
    if (signature !== undefined) {
        headers.set('x-signature', signature)
    }
    return new Request('http://localhost/webhooks', {
        method: 'POST',
        headers,
        body,
    })
}

const orderCreatedBody = JSON.stringify({
    meta: { event_name: 'order_created' },
    data: { type: 'orders', id: '1', attributes: {} },
})

describe('whatwgWebhooksHandler', () => {
    test('accepts a valid signature', async () => {
        const response = await whatwgWebhooksHandler({
            secret,
            request: post(orderCreatedBody, sign(orderCreatedBody)),
            onData: async () => {},
        })

        expect(response.status).toBe(200)
        expect(await response.json()).toMatchInlineSnapshot(`
          {
            "message": "Webhook received",
          }
        `)
    })

    test('returns 401 for a wrong signature of the same length', async () => {
        const errors: Error[] = []
        const response = await whatwgWebhooksHandler({
            secret,
            request: post(orderCreatedBody, sign('different-body')),
            onData: async () => {
                throw new Error('onData must not run')
            },
            onError: (error) => {
                errors.push(error)
            },
        })

        expect(response.status).toBe(401)
        expect(await response.json()).toMatchInlineSnapshot(`
          {
            "message": "Invalid signature.",
          }
        `)
        expect(errors.map((error) => error.message)).toEqual([
            'Invalid lemonsqueezy signature.',
        ])
    })

    test('returns 401 when x-signature length does not match', async () => {
        const errors: Error[] = []
        const response = await whatwgWebhooksHandler({
            secret,
            request: post(orderCreatedBody, 'short'),
            onData: async () => {
                throw new Error('onData must not run')
            },
            onError: (error) => {
                errors.push(error)
            },
        })

        expect(response.status).toBe(401)
        expect(await response.json()).toMatchInlineSnapshot(`
          {
            "message": "Invalid signature.",
          }
        `)
        expect(errors.map((error) => error.message)).toEqual([
            'Invalid lemonsqueezy signature.',
        ])
    })

    test('returns 401 when x-signature is missing', async () => {
        const response = await whatwgWebhooksHandler({
            secret,
            request: post(orderCreatedBody),
            onData: async () => {
                throw new Error('onData must not run')
            },
            onError: () => {},
        })

        expect(response.status).toBe(401)
        expect(await response.json()).toEqual({ message: 'Invalid signature.' })
    })

    test('does not put parse or onData errors in the response body', async () => {
        const signedInvalidJson = '{not-json'
        const parseResponse = await whatwgWebhooksHandler({
            secret,
            request: post(signedInvalidJson, sign(signedInvalidJson)),
            onData: async () => {},
            onError: () => {},
        })

        expect(parseResponse.status).toBe(400)
        expect(await parseResponse.json()).toMatchInlineSnapshot(`
          {
            "message": "Webhook error",
          }
        `)

        const errors: Error[] = []
        const onDataResponse = await whatwgWebhooksHandler({
            secret,
            request: post(orderCreatedBody, sign(orderCreatedBody)),
            onData: async () => {
                throw new Error('db password leaked')
            },
            onError: (error) => {
                errors.push(error)
            },
        })

        expect(onDataResponse.status).toBe(400)
        const body = await onDataResponse.json()
        expect(body).toEqual({ message: 'Webhook error' })
        expect(JSON.stringify(body)).not.toContain('db password leaked')
        expect(errors.map((error) => error.message)).toEqual([
            'db password leaked',
        ])
    })
})
