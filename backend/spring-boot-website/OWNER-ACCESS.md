# Owner access

The owner account is identified by the verified Auth0 token's issuer and subject. Email addresses, browser storage, and client-supplied roles do not grant access.

## Configuration

Set these backend properties in ignored local application.properties, or use the corresponding environment variables in your hosting configuration:

- app.owner.issuer / APP_OWNER_ISSUER: the full issuer URL, including https:// and its trailing slash.
- app.owner.subject / APP_OWNER_SUBJECT: the owner's exact Auth0 User ID.

Both must match exactly. Missing or blank configuration denies owner access. The development account supplied for this project is configured locally; its identity is intentionally excluded from tracked examples. Restart the backend after changing these values. Owner identity configuration needs no database migration. Product management has its own SKU index migration; see PRODUCT-MANAGEMENT.md.

## Behavior

Sign in and visit /admin. The navigation displays an Admin link after the backend verifies owner access. Each entry into /admin performs a fresh check. Signed-out customers are offered sign-in; other accounts are shown an access-denied page. Verification outages offer a retry.

GET /api/admin/access returns {"access":"owner"} with Cache-Control: no-store for the owner. The backend protects /api/admin and every route beneath /api/admin/**, for all HTTP methods. Anonymous requests receive 401; authenticated non-owner accounts receive 403. JWT signature, issuer, audience, and expiry validation continue through the existing resource-server configuration.

The navigation state is a UI convenience, not authorization. Hiding or bypassing the Angular guard never grants backend access.

The administration page supports product and variant management, including prices, stock, availability, options, and image URLs. See PRODUCT-MANAGEMENT.md for its API, database setup, and verification steps.

## Manual verification

1. Restart the backend and refresh the frontend.
2. Sign in with the configured owner account. Open the Admin link and confirm the administration page appears.
3. Sign out and open /admin directly. Confirm sign-in is required.
4. Sign in with a regular customer account and open /admin directly. Confirm access is denied.
5. Verify direct API calls to /api/admin/access return 401 without authentication and 403 for a regular customer's valid access token. Do not share or commit tokens.
6. Remove either owner setting and restart the backend: even the former owner must be denied. Restore the settings afterward.

Automated integration tests use a mocked JWT decoder to test route authorization, including wrong issuer, wrong subject, spoofed email/roles, missing configuration, future admin paths, and CORS preflight. They do not replace a real Auth0 browser sign-in check.

## Automated checks

From backend/spring-boot-website:

    .\mvnw.cmd test

From frontend/angular-frontend:

    $config = Get-Content tsconfig.owner-spec.json | ConvertFrom-Json
    $testArgs = @("ng", "test", "--watch=false", "--browsers=ChromeHeadless", "--ts-config=tsconfig.owner-spec.json")
    foreach ($file in $config.include) { if ($file.EndsWith(".spec.ts")) { $testArgs += "--include=$file" } }
    npx @testArgs
    npm run build

The focused frontend configuration includes existing checkout, order-history, and product regression tests alongside the owner-access tests.
