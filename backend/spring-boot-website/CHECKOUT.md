# Server-priced checkout

The browser submits only variant IDs, quantities, names and addresses. Database prices are authoritative.
USD and free shipping preserve the existing store behavior; tax and shipping policies still need a separate business decision.

## Database

Before starting the updated backend, apply checkout-pricing-migration.sql once to the existing MySQL database.
It adds nullable fields and two unique indexes without changing historical orders.
CheckoutSchema.java can check/apply this migration against the local database using existing application.properties credentials:

    java --class-path <path-to-mysql-connector-j.jar> CheckoutSchema.java
    java --class-path <path-to-mysql-connector-j.jar> CheckoutSchema.java --apply

This helper rejects non-local databases. On other deployments, use the SQL through the normal database migration process.
Do not use Hibernate create/create-drop against the store database.

## Flow

Opening the cart automatically refreshes prices and availability, persists current prices, and shows before/after notices.
Quantity changes trigger another check. Checkout stays unavailable until verification succeeds and all items are purchasable.
Direct checkout links also refresh prices before revealing the form. Neither operation creates an order or payment.

0. POST /api/checkout/quote: {items: [{variantId, quantity}]}. Read-only catalog lookup; returns current prices,
   availability and per-item messages. Missing/inactive/insufficient-stock variants remain visible for removal.
1. On Pay, POST /api/checkout/review: requestId (random UUID v4), items [{variantId, quantity}], customer and addresses.
   Creates a PENDING order with immutable SKU/name/price/quantity snapshots. Duplicate variants are aggregated.
   Missing/inactive/insufficient-stock variants, invalid quantities, and invalid USD prices are rejected.
   If the saved total and item prices match the displayed prices, payment starts immediately. If they changed while the form was open, show the updated amount and wait for a second Pay click before creating a payment intent. Old cart entries without variant IDs must be removed and re-added.
2. POST /api/checkout/payment-intent: {checkoutToken}. Amount and currency come exclusively from the saved order.
   The database row is locked; Stripe creation uses the same token as an idempotency key.
   Subsequent attempts reuse the saved intent. After 30 minutes, recovery cancels unpaid intents before expiring their checkouts; processing payments retain inventory.
3. Stripe.js confirms the saved intent and handles authentication.
4. POST /api/checkout/purchase: {checkoutToken}. The backend retrieves Stripe's status and verifies succeeded,
   currency, amount, amount received and checkout metadata before marking the same order PAID.
   Repeated confirmation is idempotent. The old unverified purchase/amount-based endpoints are replaced.
5. POST /api/checkout/resume recovers the saved summary. Only a random checkout token is stored in sessionStorage.
6. POST /api/checkout/cancel cancels any incomplete Stripe intent before allowing a new checkout.
   Completed/processing payments cannot be abandoned through this operation.

Checkout tokens are guest capability credentials. Never include them in public order responses or logs.
Customer order-history authorization uses verified account ownership; see Account order ownership below.

## Webhook recovery

The local listener is configured with the existing Stripe TEST key. Restart the backend to load its signing secret.
From backend/spring-boot-website, restart forwarding when needed:

    powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Start-StripeWebhooks.ps1

This starts a hidden listener for the payment events below, forwards them to the locally configured HTTPS backend port,
and saves the signing secret into ignored application.properties. It rejects live keys and never prints credentials.
The process-only policy flag does not change Windows execution policy. Logs and the CLI are under ignored target/.
Stop the listener before running Maven clean:

    powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Stop-StripeWebhooks.ps1

The stop helper verifies the recorded PID belongs to this project's CLI before stopping its process tree.
For a fresh installation, install the official CLI locally first:

    npm install --prefix target/stripe-cli --no-save --package-lock=false @stripe/cli

In a deployed environment, register POST /api/checkout/webhook and configure stripe.webhook.secret using secret
configuration. STRIPE_WEBHOOK_SECRET is a fallback when no explicit property is set. Never commit a secret.
Register snapshot events: payment_intent.succeeded, payment_intent.processing, payment_intent.payment_failed,
payment_intent.requires_action, and payment_intent.canceled.

The handler verifies signatures, retrieves current Stripe data (events may arrive out of order), and checks that the
payment ID belongs to the saved order. All confirmation paths share a row-locked reconciliation transaction.
Repeated notifications do not create orders or repeat a paid transition. Database/provider failures are not acknowledged,
allowing Stripe to retry. An unconfigured signing secret returns 503; missing/invalid signatures return 400.

Official references: https://docs.stripe.com/webhooks and https://docs.stripe.com/payments/payment-intents/verifying-status

## Automatic reconciliation

A background job checks one batch of up to 100 recoverable orders every minute, starting 60 seconds after startup.
It retrieves existing payments only: it never creates, confirms, or charges a payment. A successful payment is verified
against the stored ID, checkout metadata, currency, expected amount and amount received before the order becomes PAID.
Each order has its own transaction, so one failure does not block later orders. A cursor rotates through all candidates
so old declines cannot keep newer successful payments out of the batch. Failed attempts are retried on a later pass.
Logs identify the order ID and exception class, without logging tokens, provider responses, or customer details.

Configuration (milliseconds):

    checkout.reconciliation.enabled=true
    checkout.reconciliation.initial-delay-ms=60000
    checkout.reconciliation.delay-ms=60000

Set enabled=false to disable the job. Tests disable scheduling and exercise the job explicitly.

| Order status | Meaning |
| --- | --- |
| PENDING | Waiting for a payment method or confirmation |
| REQUIRES_ACTION | Customer/bank authentication is needed |
| PAYMENT_FAILED | Previous attempt declined; retry the same order and payment intent |
| PROCESSING | Payment is processing or awaiting capture; do not fulfil or create another payment |
| PAID | Verified successful payment for the exact saved amount |
| CANCELLED | Payment/checkout cancelled |
| EXPIRED | More than 30 minutes old; payment never started or its unpaid intent was safely cancelled |

A recorded payment is never expired solely because of age: Stripe must confirm cancellation first. Processing and awaiting-capture payments keep their reservations. Paid orders never regress on stale events.
Browser confirmation throws a not-paid response only after the status transaction commits, so decline/processing states
are retained. Returning to checkout or selecting Check payment status also reconciles the current payment.
No new schema migration is needed for these statuses.
## Verification

Backend: .\\mvnw.cmd test
Frontend: npm run build -- --configuration development
Focused frontend: npm test -- --ts-config=tsconfig.checkout-spec.json --watch=false --browsers=ChromeHeadless --include=src/app/components/checkout/checkout.component.spec.ts --include=src/app/components/cart-details/cart-details.component.spec.ts --include=src/app/services/checkout.service.spec.ts

No live charge is needed for unit tests. Before deployment, use Stripe test mode to exercise successful payment,
decline, authentication, duplicate webhook delivery, refresh, cancellation, and a lost confirmation response.

Apply inventory-reservation-migration.sql before starting this version (pause checkout traffic and resolve
existing unpaid Stripe intents first). Review atomically removes reserved quantities from available stock.
Payment consumes that reservation without subtracting again. Cancellation restores stock once; failed payments
retain the reservation for retry. After 30 minutes, recovery expires unpaid checkouts only after any existing
Stripe intent has been cancelled successfully. Processing, awaiting-capture, and paid payments retain stock;
provider uncertainty keeps the reservation until a later recovery succeeds. The recovery job must remain enabled.
Catalog stock means available units, excluding reservations. Reserved variants cannot be deleted; deactivate them
instead. Existing paid orders are not retroactively deducted; reconcile physical inventory during rollout. Pending orders are retained for recovery/audit; automatic retention cleanup is not included.

Recovery tests include concurrent browser/webhook confirmation against an isolated H2 database, an intentionally rolled-back
confirmation followed by recovery, duplicate/out-of-order signed notifications, rejected signatures, transient outages,
declines followed by successful retry, cursor progression, and processing-state UI recovery. The normal regression suite uses simulated Stripe responses. An additional opt-in sandbox test has also passed against
Stripe with a test key: a 50-cent test-mode payment succeeds without browser confirmation, the job recovers it, and
replayed signed webhook notifications remain idempotent. Its database is isolated H2; it never writes store orders
or submits customer data. Live keys are rejected, and no real funds move. Interactive browser/3DS testing remains manual.

Run this test explicitly (it is skipped in normal test runs):

    .\mvnw.cmd test '-Dtest=StripeSandboxRecoveryTest' '-Dcheckout.stripe-sandbox-tests=true'

Stripe test-method reference: https://docs.stripe.com/testing
## Payment application logs

Payment lifecycle events use the dedicated SLF4J logger named payments and the existing Spring Boot console output.
There is no new log database, separate audit service, or automatic log file. In production, capture console output with
the hosting platform's normal log collector. To enable these entries explicitly, set logging.level.payments=INFO.

Messages use stable key=value fields, for example:

    event=payment_intent_created source=BROWSER order_id=123
    event=order_status_changed source=WEBHOOK order_id=123 previous_status=PENDING status=PAID
    event=payment_recovered source=BACKGROUND order_id=123
    event=webhook_processed source=WEBHOOK order_id=123 event_id=evt_example reason=reconciled
    event=payment_recovery_retry source=BACKGROUND order_id=123 error_type=APIConnectionException

Successful status changes and payment creation/reuse are logged only after the database commits. A rolled-back transaction
does not emit a successful transition. Duplicate webhook deliveries are logged as processed without repeating a status
change. Ignored/rejected notifications have a fixed reason code; no order ID is available before a notification can be
matched to an order. Failed deliveries preserve their existing retry behavior.

Unchanged background checks do not produce success logs. A failed check produces one sanitized retry warning.
No checkout tokens, client secrets, signing secrets, card data, email addresses, addresses, request/response bodies,
exception messages, or exception stack traces are added to these lifecycle entries. Event IDs and fixed fields are
sanitized before logging. Application logs are separate from the local Stripe CLI forwarding logs in target/.
## Account order ownership

Order history now uses GET /api/me/orders?page=0&size=20 (size 1–100).
The verified JWT issuer and subject identify the owner; email, query parameters, and browser storage do not.
New signed-in checkout reviews save that identity on the pending order. Guest orders have no account owner.
Retrying an existing checkout never assigns or changes its owner. There is no guest-order claiming feature.

GET /api/me/orders/{id}, /{id}/items, /{id}/shipping-address, and /{id}/billing-address
use the same owner-scoped lookup. Unauthenticated access returns 401; another account's or an unassigned
order returns 404. Responses use explicit DTOs without checkout tokens, payment identifiers, or customer entities.
Legacy orders, customer, address, and order-item repository routes are blocked, and OrderRepository and
CustomerRepository are no longer exported by Spring Data REST. They remain available internally.

Apply order-ownership-migration.sql before starting the updated backend. It adds nullable owner_issuer and
owner_subject columns with a case-sensitive collation and a composite lookup index. Existing orders are neither
deleted nor assigned using email. For local development, run from this backend directory:

    java --class-path C:/Users/roebu/.m2/repository/com/mysql/mysql-connector-j/9.6.0/mysql-connector-j-9.6.0.jar OrderOwnershipSchema.java --apply

Omit --apply for inspection only. The helper reads the ignored local application.properties and refuses remote databases.
The migration has been applied to the local development database. Restart the backend to use the new endpoints.

Ownership integration tests exercise two accounts sharing the same customer email, different issuers, case-sensitive
subjects, missing/invalid identities, pagination, old repository routes, owner-scoped related resources, forged
checkout ownership, and guest checkout. JWT decoding and Stripe are mocked; no real payments are made.

Run the backend suite with .\mvnw.cmd test. From frontend/angular-frontend, run:

    npm test -- --ts-config=tsconfig.orders-spec.json --watch=false --browsers=ChromeHeadless --include=src/app/services/pending-checkout.service.spec.ts --include=src/app/services/auth-interceptor.service.spec.ts --include=src/app/services/order-history.service.spec.ts --include=src/app/components/order-history/order-history.component.spec.ts --include=src/app/components/checkout/checkout.component.spec.ts --include=src/app/components/cart-details/cart-details.component.spec.ts --include=src/app/services/checkout.service.spec.ts

This focused suite includes the existing checkout/cart checks. Other uses of browser storage and the broader
migration from Spring Data REST to controllers remain separate tasks.

## Checkout recovery corrections

Pending recovery tokens now use separate sessionStorage slots for the verified account subject and for guests.
These slots are a UI convenience; backend authorization is authoritative. Auth0 initialization completes before
selecting a slot or prefilling checkout email. Email prefill uses the current Auth0 profile, not userEmail in storage.

For account-owned orders, review retries, resume, cancel/edit, payment-intent creation, and purchase confirmation
require the same verified issuer/subject as the saved order. The frontend attaches the access token to those
operations when signed in. Guest checkouts retain their random-token recovery and never become account-owned
when resumed after login. Webhooks and scheduled reconciliation remain server-side operations.

The older shared premearPendingCheckout key is not restored automatically. Its token is preserved and can be
checked explicitly using Check previous checkout; a successful recovery moves it into the current slot.
This avoids deleting a potentially successful payment reference or automatically displaying an old decline for
a different account. Ownership failures leave the old reference intact for its original account.

Retryable saved orders offer Edit details. The backend must successfully close the previous unpaid attempt
before the customer/address form opens. Paid/processing attempts cannot be replaced through that action.
Missing/expired/cancelled recovery state resets cleanly. Payment errors reconcile server status when possible,
and processing/action-required states and notices are updated consistently. Recovering a paid order clears
the cart only when its variants and quantities match the purchased snapshot.

Regression coverage includes a rendered checkout form, edit-button clicks, identity initialization/account
isolation, explicit legacy recovery, missing tokens, old payment recovery with a different cart, retry notices,
and ownership checks on all customer-facing payment recovery operations.


## Changed carts and pending checkout

Cart changes automatically close the previous unpaid checkout without asking the customer to choose or confirm.
PendingCheckoutService starts with the application, watches cart contents and the current identity, and reconciles
only that guest/account recovery slot. Variant IDs and quantities determine a change; price-only changes do not.
This runs on the cart/catalog pages as well as checkout, including when all cart items are removed.

The backend checks payment status before cancellation. Paid or processing/awaiting-capture payments are preserved.
Successful cancellation or expiry clears the matching saved token. Network failures, authorization failures, and
uncertain cancellation responses retain recovery. Concurrent app/checkout requests share the same reconciliation
work to avoid duplicate cancellation calls. The checkout page automatically clears old notices/card state and
checks current cart prices once the unpaid attempt is closed. It shows status/retry controls for unresolved
payments instead of the old cart comparison and choice panel.

Regression coverage includes silent page recovery, cart changes on other pages, empty carts, account isolation,
unchanged items, concurrent recovery, successful-payment races, processing payments, and unavailable status checks.

## Review heading and guest detail entry

Checkout includes a Review your order heading. Guest customer/address fields remain expanded while completing
or retrying payment. Processing payments temporarily lock editing, and confirmation replaces the form after success.
Guest details are not restored on refresh/navigation; the app ignores stored userEmail for guest prefill and
sets autocomplete off for the guest form. Typed fields remain in memory during the current visit. Browser-managed
autofill is separate from application restoration.

A guest returning to an unpaid attempt must re-enter required details. Before using newly entered/changed details,
checkout reconciles and safely cancels the previous unpaid attempt, then creates a fresh priced snapshot with
those details. Unchanged details retry the same snapshot during the same visit. Paid/processing results prevent replacement.
Only the recovery token is persisted in the browser; card data is never saved or repopulated by the application.

Signed-in customers restore saved customer, shipping, and billing fields from their account-owned pending checkout.
POST /api/checkout/details requires a verified matching issuer/subject and refuses guest orders even when their token
is supplied by a signed-in caller. The response has only contact/address DTOs, without card data or payment credentials.
Country/state dropdowns are restored from their normal API options. A restoration failure leaves an explicit message and the expanded fields for manual entry. Restart the backend for this new endpoint.

Contact reuse now matches email plus first and last names. Re-entering a different name creates a distinct contact
instead of silently using old names or rewriting older orders. The local customer table was inspected read-only
and has no unique single-column email constraint; no schema migration was needed.

## Expanded checkout details

Customer and delivery fields remain expanded for both guests and signed-in customers. The saved-details message
and its Edit details prompt have been removed. Fields temporarily disable during requests or processing payments.
Signed-in restoration still fills the saved account-owned details, without card data. Unchanged details reuse
the existing reviewed attempt; changes safely replace the unpaid snapshot before payment for either identity.

## Checkout validation and UI states

Checkout API errors use `{code, message, fieldErrors}`. Field errors are keyed by request paths
(for example `customer.email`, `shippingAddress.zipCode`, or `items[0].quantity`).
Validation collects missing and oversized contact/address fields, invalid variation IDs, and invalid quantities.
Quantities and variation IDs must be JSON integers: decimal numbers and numeric strings are rejected.
Each line and the combined quantity for a variation are limited to 999; carts contain 1–100 lines.
Unavailable items return HTTP 409 with indexed cart errors. No order or payment is created for invalid input.
Prices, database IDs, status, and timestamps remain server-controlled.

The checkout form displays field errors beside their inputs, focuses the first affected customer/address input,
and clears that server error when the field changes while retaining normal client validation.
Cart errors appear with a link back to the cart. General payment/service errors retain their existing placement.
Errors are not persisted as form state.

A single derived UI state controls whether the form is locked and payment is available:
loading, ready, submitting, authentication-required, processing, recovery-required, cart-updating,
failed, or confirmed. It derives from the active request and server order status so it cannot independently
drift from the recovery flow. An uncertain request retains its checkout token for recovery; processing payments
cannot be resubmitted, and only backend confirmation clears the matching cart.
The existing inline confirmation and automatic scroll are retained.

Regression tests cover structured field errors and corrections, unavailable products, empty carts,
combined quantity limits, decimal/string/overflow input rejection, and authentication/processing/confirmed controls,
alongside the existing decline, retry, ownership, cart replacement, and reconciliation tests.
