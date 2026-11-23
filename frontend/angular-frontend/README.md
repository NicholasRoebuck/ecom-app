# AngularFrontend

This project was generated with [Angular CLI](https://github.com/angular/angular-cli) version 17.3.8.

## Development server

Run `ng serve` for a dev server. Navigate to `http://localhost:4200/`. The application will automatically reload if you change any of the source files.

## Code scaffolding

Run `ng generate component component-name` to generate a new component. You can also use `ng generate directive|pipe|service|class|guard|interface|enum|module`.

## Build

Run `ng build` to build the project. The build artifacts will be stored in the `dist/` directory.

## Running unit tests

Run `ng test` to execute the unit tests via [Karma](https://karma-runner.github.io).

## Running end-to-end tests

Run `ng e2e` to execute the end-to-end tests via a platform of your choice. To use this command, you need to first add a package that implements end-to-end testing capabilities.

## Further help

To get more help on the Angular CLI use `ng help` or go check out the [Angular CLI Overview and Command Reference](https://angular.io/cli) page.

## Disposable owner preview on Render

This preview packages Angular and Spring Boot into one service with an isolated, in-memory H2 database. It seeds 24 sample listings, Hearing/Vision departments, lens options/images, and US address choices. Changes are shared by visitors while this process runs; every restart, redeploy, or idle shutdown resets them. Your local MySQL database is never used by the preview profile.

Commit and push the reviewed application changes before connecting the GitHub repository to Render. Create a **Web Service** using **Docker** and the **Free** instance:

| Setting | Value |
| --- | --- |
| Root Directory | Leave blank (repository root) |
| Dockerfile Path | backend/spring-boot-website/Dockerfile.render-preview |
| Docker Build Context | . (repository root) |
| Docker Command | Leave blank |
| Health Check Path | /api/preview-health |

Use the full preview Dockerfile above, not Dockerfile.render-smoke (which only tests backend capacity).

Set OWNER_SUBJECT to the existing owner's exact Auth0 user ID (sub). The existing Auth0 tenant/client and API audience are defaults. Leave this unset to deny all admin access. In Auth0, add the Render HTTPS origin with /login/callback to Allowed Callback URLs, and the origin itself to Allowed Logout URLs and Allowed Web Origins. Set PREVIEW_ORIGIN in Render to that origin too. The API audience http://localhost:8080 is an Auth0 identifier, not a deployed network address; keep it if that is the identifier registered in Auth0.

Optional checkout settings:

| Render environment variable | Purpose |
| --- | --- |
| STRIPE_TEST_SECRET_KEY | Backend sk_test_ key; never commit it |
| PREVIEW_STRIPE_PUBLISHABLE_KEY | Frontend pk_test_ key; requires rebuilding/redeploying |
| STRIPE_TEST_WEBHOOK_SECRET | Signing secret for a Stripe test webhook pointing at this deployment |

Without Stripe keys, catalog/cart/admin can be previewed, but payments are unavailable. The preview rejects live Stripe keys. Existing payment routes, price validation and inventory reservations are retained for test checkout. Do not use this disposable environment for real orders.

Optional Auth0 overrides are PREVIEW_AUTH0_DOMAIN, PREVIEW_AUTH0_CLIENT_ID, AUTH0_ISSUER (full URL with trailing slash), and AUTH0_AUDIENCE. Frontend values are embedded at build time. Never put secret keys into frontend variables.

Render Free services sleep after 15 minutes without inbound traffic, and waking can take about a minute. See [Render Free documentation](https://render.com/docs/free) and [Docker settings](https://render.com/docs/docker). No external database is required. Local Java/frontend builds were checked, but the Docker image and Free-instance capacity must still be verified on Render.
