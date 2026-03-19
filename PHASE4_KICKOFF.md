# Phase 4 Kickoff (Store & Orders)

## Current baseline
- Phase 3 wallet/payment/subscription flows are implemented and validated.
- Backend branch for Phase 4: `codex/phase4-kickoff`.

## Phase 4 start order
1. Products module (schema + CRUD + moderation).
2. Orders module (create order -> wallet purchase transaction).
3. Digital delivery for successful order.
4. Custom order quote flow.
5. Store dashboard endpoints.
6. Reviews module.
7. Auto-complete cron for delivered orders.
8. Platform fee settlement logic.

## Technical prerequisites to implement in this phase
- Add rate limiting for store endpoints (`ThrottlerModule` + route-level policy).
- Add secure download flow for digital files (presigned URL endpoint).
- Add order auto-complete scheduler job.

## First coding milestone (M1)
- Deliver `products` and `orders` modules with:
  - Product creation/update/publish lifecycle for staff/admin.
  - Order creation endpoint that calls existing `wallet.purchase()`.
  - Order cancellation endpoint with `wallet.refund()` integration.
  - Basic tests for order payment and refund paths.
