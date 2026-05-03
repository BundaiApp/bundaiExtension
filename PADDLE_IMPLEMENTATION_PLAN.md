# Bundai Subscription + Paddle Integration Plan

## Overview

Extension is the paid entry point. Web app handles signup + payment via Paddle. Extension just checks `hasPaid` from `me` query.

**Traffic flows: website → extension** (not extension → website).

## Pricing (Monthly & Yearly only for now)

- Monthly: $8.99/mo
- Yearly: $29.99/yr
- Lifetime: $69 (occasional promo, not now)

## Flow

```
User lands on bundai.app → signs up → Paddle checkout → pays
→ Paddle webhook hits server → server sets hasPaid=true
→ User installs extension → logs in → extension checks hasPaid → allows access
```

---

## Phase 1: Extension Changes (bundaiExtension) — Paywall

### 1. Remove signup from extension

- "Sign Up" button opens `bundai.app/signup` in new tab
- Keep login in extension as-is

### 2. Add `hasPaid` check after login in popup/index.tsx

- Query `me` → check `hasPaid`
- If `false` → show paywall: "Subscribe to use Bundai" with button opening `bundai.app/pricing`
- If `true` → show normal UI

### 3. Check subscription on video load

- Before fetching subtitles for a new video, re-fetch `me` and verify `hasPaid`
- Don't worry about mid-session (check before new video only)

### 4. No free tier for extension

- Extension is fully gated behind subscription

---

## Phase 2: Web App Changes (bundaiWeb) — Paddle Checkout

### 1. Install `@paddle/paddle-js`

- Remove unused Stripe packages

### 2. Replace pricing button behavior

- If not logged in → navigate to `/signup` (existing)
- If logged in but `hasPaid === false` → open `Paddle.Checkout.open()` with selected plan
- If logged in and `hasPaid === true` → show "Manage Subscription" link

### 3. Add Paddle.js init

```js
Paddle.Environment.set("sandbox") // for testing
Paddle.Setup({ seller: SELLER_ID })
```

### 4. After checkout success

- Redirect to dashboard, refresh `me` query

---

## Phase 3: Server Changes (api.bundai.app) — Webhooks + Subscription State

### 1. Add Paddle webhook endpoint

- `POST /webhooks/paddle`
- Verify signature with Paddle public key
- On `transaction.completed` → find user by email → set `hasPaid: true`
- On `subscription.canceled` / `subscription.expired` → set `hasPaid: false`

### 2. Update User model

- Add `paddleCustomerId: String`
- Add `paddleSubscriptionId: String`
- Add `subscriptionStatus: String` (active, canceled, expired)
- Keep `hasPaid: Boolean` as the source of truth

### 3. Update GraphQL schema

- Fix `hasPaid: String` → `hasPaid: Boolean`
- Add `subscriptionStatus: String` to `User` type

### 4. Add env vars

- `PADDLE_WEBHOOK_SECRET`
- `PADDLE_VENDOR_ID`
- `PADDLE_CLIENT_AUTH_CODE`

---

## Phase 4: Testing (Sandbox)

1. Use Paddle sandbox test cards for payment
2. Test: signup → checkout → webhook → `hasPaid` set to true
3. Test: login in extension → `hasPaid` check passes → full access
4. Test: cancel subscription → webhook → `hasPaid` set to false → extension locked

---

## Prerequisites

1. Paddle account with sandbox mode enabled
2. Two subscription products created in Paddle sandbox (Monthly $8.99, Yearly $29.99)
3. Paddle seller ID and client token from dashboard
4. Webhook URL configured: `https://api.bundai.app/webhooks/paddle`

---

## Current User Model (server/models/user.model.js)

```js
{
  email: String,
  password: String,
  hasPaid: Boolean,           // <-- exists but never set
  stripeCustomerId: String,   // <-- exists but never used (switch to Paddle)
}
```
