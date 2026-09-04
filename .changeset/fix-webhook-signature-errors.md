---
'lemonsqueezy-webhooks': patch
---

Keep invalid webhook signatures on a stable **401** path, including when `x-signature` is missing or the wrong length.

`crypto.timingSafeEqual()` throws if the buffers have different lengths. A malformed or missing `x-signature` used to skip the intended 401 branch and return **400** instead. The handler now length-checks first, so every bad signature gets the same `Invalid signature.` response.

Parse errors and `onData` exceptions still return **400**, but the body is now a generic `Webhook error`. The original exception is still passed to `onError` for logs.
