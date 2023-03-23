import type { NextApiResponse, NextApiRequest } from 'next'
import { Prisma, prisma } from 'db'

import crypto from 'crypto'
import { Readable } from 'stream'

import { env } from '@app/env'
import { notifyError } from '@app/utils/sentry'
import { LemonsqueezySubscription } from 'lemonsqueezy.ts/types'
import { AppError } from '@app/utils/errors'

// you might need to extend this if you need additional properties from the request body
// details: https://docs.lemonsqueezy.com/api/webhooks

export type HookData =
    | {
          meta: {
              event_name:
                  | 'subscription_created'
                  | 'subscription_cancelled'
                  | 'subscription_resumed'
                  | 'subscription_expired'
                  | 'subscription_paused'
                  | 'subscription_unpaused'
              custom_data: any
          }
          data: Lemon.Subscription
      }
    | {
          meta: {
              event_name:
                  | 'subscription_payment_success'
                  | 'subscription_payment_failed'
                  | 'subscription_payment_recovered'
              custom_data: any
          }
          data: Lemon.SubscriptionInvoice
      }
    | {
          meta: {
              event_name: 'order_created' | 'order_refunded'
              custom_data: any
          }
          data: Lemon.Order
      }
    | {
          meta: {
              event_name: 'license_key_created'
              custom_data: any
          }
          data: Lemon.LicenseKey
      }

export type EventName = HookData['meta']['event_name']

export const config = {
    api: {
        bodyParser: false,
    },
}

async function buffer(readable: Readable) {
    const chunks = []
    for await (const chunk of readable) {
        chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
    }
    return Buffer.concat(chunks)
}

// if user creates subscription, create sub and payment, for every new renewal, add new payment
// for 1 time payments, listen for orders and create a payment

// how do i know if order is a subscription or not?
// if sub created already finished with same order id, then it's a subscription

export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse,
) {
    // you need to set this webhook secret inside your Lemon Squeezy account
    // Settings -> Webhooks -> create or click on a webhook URL, set the secret
    const signingSecret = env.SECRET || ''

    if (req.method !== 'POST') {
        // you can see whether a webhook delivers successfully in your Lemon Squeezy account
        // -> Settings -> Webhooks -> Recent deliveries
        console.log('Method not allowed', req.method)
        return res.status(405).json({
            message: 'Method not allowed',
        })
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
            return res.status(401).json({
                message: 'Invalid signature.',
            })
        }

        const payload: HookData = JSON.parse(rawBody)

        const eventName = payload.meta.event_name
        const customData = payload.meta.custom_data

        console.log('eventName', eventName)
        console.log('customData', JSON.stringify(customData))
        console.log('event data', JSON.stringify(payload, null, 2))
        let orgId = customData.orgId
        if (eventName === 'order_created') {
            let data = payload.data as Lemon.Order
            let item = data.attributes.first_order_item
            let create: Prisma.PaymentForCreditsCreateManyInput = {
                id: String(data.id),
                // price: 0,
                email: data.attributes.user_email,
                variantName: item.variant_name,
                orderId: String(data.id),
                orgId,
                productId: String(item.product_id),
                variantId: String(item.variant_id),
            }
            await prisma.paymentForCredits.upsert({
                where: { id: String(data.id) },
                create,
                update: create,
            })
            // do something when a new purchase comes in
        } else if (eventName === 'order_refunded') {
        } else if (eventName === 'subscription_created') {
            let data = payload.data as Lemon.Subscription
            let create: Prisma.SubscriptionCreateManyInput = {
                orgId: orgId,
                orderId: String(data.attributes.order_id),
                productId: String(data.attributes.product_id),
                variantId: String(data.attributes.variant_id),
                subscriptionId: String(data.id),
                status: data.attributes.status,
                email: data.attributes.user_email,
                variantName: data.attributes.variant_name,
                createdAt: new Date(data.attributes.created_at),
            }
            let sub = await prisma.subscription.upsert({
                where: { subscriptionId: String(data.id) },
                create,
                update: create,
            })

            // do something when the purchase is refunded
        } else if (eventName === 'subscription_payment_success') {
            let data = payload.data as Lemon.SubscriptionInvoice
            let sub = await prisma.subscription.findUnique({
                where: {
                    subscriptionId: String(data.attributes.subscription_id),
                },
            })
            if (!sub) {
                throw new AppError(
                    `Subscription not found for payment ${data.id}`,
                )
            }
            // let subscription = await prisma.subscription.findUnique({
            let create: Prisma.PaymentForCreditsCreateManyInput = {
                id: String(data.id),
                orgId: orgId,
                productId: String(sub.productId),
                // price: data.attributes.total,
                email: sub.email,
                orderId: String(sub.orderId),
                variantId: sub.variantId,
                variantName: sub.variantName,
            }
            await prisma.paymentForCredits.upsert({
                where: { id: String(data.id) },
                create,
                update: create,
            })
        } else if (
            eventName === 'subscription_cancelled' ||
            eventName === 'subscription_expired' ||
            eventName === 'subscription_paused' ||
            eventName === 'subscription_resumed' ||
            eventName === 'subscription_unpaused'
        ) {
            let data = payload.data as Lemon.Subscription
            let create: Prisma.SubscriptionCreateManyInput = {
                orgId: orgId,
                orderId: String(data.attributes.order_id),
                productId: String(data.attributes.product_id),
                variantId: String(data.attributes.variant_id),
                subscriptionId: String(data.id),
                email: data.attributes.user_email,
                endsAt: data.attributes.ends_at
                    ? new Date(data.attributes.ends_at)
                    : undefined,
                status: data.attributes.status,
                variantName: data.attributes.variant_name,
                createdAt: new Date(data.attributes.created_at),
            }
            let sub = await prisma.subscription.upsert({
                where: { subscriptionId: String(data.id) },
                create,
                update: create,
            })
        } else {
            console.log('Unknown event name', eventName)
            return res.status(200).json({
                message: `Unknown event name: ${eventName} for order: ${JSON.stringify(
                    payload.meta,
                )}`,
            })
        }
    } catch (e: any) {
        notifyError(e)
        if (typeof e === 'string') {
            return res.status(400).json({
                message: `Webhook error: ${e}`,
            })
        }
        if (e instanceof Error) {
            return res.status(400).json({
                message: `Webhook error: ${e.message}`,
            })
        }
        throw e
    }

    // if no errors occur, respond with a 200 success
    res.json({ received: true })
}
