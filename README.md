# Full-Stack E-commerce Application

A full-stack e-commerce portfolio project built with **Next.js, React, TypeScript, Node.js, Express, and MongoDB**. The application includes a customer storefront, shopping cart, account-based order history, an admin area, and a **Stripe test-mode checkout** workflow. Its backend includes authentication and authorization controls, transactional inventory reservation, payment verification, and webhook handling.

> **Project status:** Developed and tested locally as a portfolio project. Checkout uses Stripe **test mode**; this repository is not presented as a production-ready store or a live-payment deployment.

## Features

### Customer experience

- Browse a storefront with product images, prices, and available stock.
- Open individual product detail pages.
- Add products to a cart and adjust or clear the cart.
- Sign up, log in, and access protected account pages.
- Start Stripe-hosted checkout in test mode.
- Return to the application after successful or canceled checkout.
- View personal order history and individual order details.

### Administration

- Protected admin dashboard and product management pages.
- Admin order management pages.
- Backend role-based access checks for protected operations.

### Payments and inventory

- Create orders and reserve available inventory during checkout.
- Reject checkout requests when there is insufficient stock.
- Prevent competing reservations from selling the same final unit twice.
- Confirm paid orders after verifying Stripe payment information.
- Handle Stripe checkout expiration and asynchronous payment failure.
- Release reserved inventory for verified expired or failed orders.
- Avoid double deductions or double releases when operations are repeated.
- Include tests for reconciling missed payment and expiration events.

## Tech stack

| Layer                        | Technologies                                          |
| ---------------------------- | ----------------------------------------------------- |
| Frontend                     | Next.js 16, React 19, TypeScript, Tailwind CSS 4      |
| Frontend data fetching       | TanStack React Query                                  |
| Backend                      | Node.js, Express 5, TypeScript                        |
| Database                     | MongoDB, Mongoose                                     |
| Payments                     | Stripe Checkout, Stripe webhooks                      |
| Authentication               | JSON Web Tokens, bcrypt, HTTP cookies                 |
| Validation and HTTP security | Zod, Helmet, CORS, express-rate-limit                 |
| Logging                      | Pino                                                  |
| Email library                | Nodemailer                                            |
| Tests                        | Node.js test runner, Supertest, MongoDB Memory Server |

## How the application connects

```text
Browser
  |
  v
Next.js frontend (http://localhost:3000)
  |
  | /api/backend/*
  v
Next.js rewrite/proxy
  |
  | http://localhost:5000/api/v1/*
  v
Express API
  |                     \
  v                      v
MongoDB                Stripe API
                          |
                          v
                 Verified Stripe webhooks
                          |
                          v
                       Express API
```

The rewrite is defined in `client/next.config.ts`. It uses `BACKEND_URL` when set and otherwise defaults to `http://localhost:5000`.

## Project organization

```text
.
├── client/                  # Next.js frontend
│   ├── public/productsImages/  # Storefront product images
│   └── src/
├── server/                  # Express API
│   ├── src/
│   │   ├── config/
│   │   ├── models/
│   │   ├── services/
│   │   ├── validators/
│   │   └── scripts/
│   └── tests/               # Automated backend tests
└── README.md
```

This is a simplified overview, not a complete listing of every source folder.

## Local setup

### Prerequisites

- Node.js and npm.
- A MongoDB deployment that supports transactions (for example, a MongoDB Atlas cluster or a local replica set).
- A Stripe account with **test-mode** API access for checkout testing.
- Stripe CLI if you want to forward Stripe events to the local backend.

### 1. Install dependencies

Open a terminal in the repository root:

```bash
cd server
npm install
```

In a second terminal, from the repository root:

```bash
cd client
npm install
```

### 2. Configure the backend

Create `server/.env` locally. Use your own values; **never commit this file**.

```dotenv
NODE_ENV=development
PORT=5000
CLIENT_URL=http://localhost:3000
MONGODB_URI=your_mongodb_connection_string
JWT_SECRET=replace_with_a_long_random_secret
STRIPE_SECRET_KEY=sk_test_your_test_key
STRIPE_WEBHOOK_SECRET=whsec_your_local_or_endpoint_signing_secret
LOG_LEVEL=info
```

These are environment variable names referenced by the backend source. Their actual requirements depend on the corresponding application configuration. Use a MongoDB deployment that supports the inventory transactions.

### 3. Configure the frontend

For the default local backend on port 5000, `BACKEND_URL` is optional. To set it explicitly, create `client/.env.local`:

```dotenv
BACKEND_URL=http://localhost:5000
```

`client/next.config.ts` rewrites requests from `/api/backend/:path*` to `${BACKEND_URL}/api/v1/:path*`. Restart the Next.js development server after changing this setting.

### 4. Start both applications

Terminal 1, from `server/`:

```bash
npm run dev
```

Terminal 2, from `client/`:

```bash
npm run dev
```

Open **http://localhost:3000**. The backend is configured to use port **5000** in this example. An API health endpoint is available at **http://localhost:5000/api/health**.

### 5. Test Stripe webhooks locally

Run Stripe CLI using an authorization or test API key for the **same Stripe account used by the backend**. Forward the relevant Checkout events to:

```text
http://localhost:5000/api/v1/stripe/webhook
```

Example listener command:

```bash
stripe listen --events checkout.session.completed,checkout.session.async_payment_succeeded,checkout.session.async_payment_failed,checkout.session.expired --forward-to http://localhost:5000/api/v1/stripe/webhook
```

Set `STRIPE_WEBHOOK_SECRET` to the signing secret for the **active listener or configured webhook destination**, then restart the backend. Do not use real payment details for test-mode checkout.

## Scripts and quality checks

### Backend (`server/`)

| Command                 | Purpose                        |
| ----------------------- | ------------------------------ |
| `npm run dev`           | Run the API in watch mode      |
| `npm run typecheck`     | Check backend TypeScript types |
| `npm run lint`          | Lint backend source            |
| `npm run build`         | Compile the backend            |
| `npm start`             | Start the compiled backend     |
| `npm run test:security` | Run backend automated tests    |

### Frontend (`client/`)

| Command            | Purpose                         |
| ------------------ | ------------------------------- |
| `npm run dev`      | Run Next.js locally             |
| `npx tsc --noEmit` | Check frontend TypeScript types |
| `npm run lint`     | Lint frontend source            |
| `npm run build`    | Build Next.js for production    |
| `npm start`        | Start the built frontend        |

### Latest local checks

The latest local checks performed during project preparation passed:

- **Backend:** TypeScript check, ESLint, and build.
- **Frontend:** TypeScript check, ESLint, and Next.js build.
- **Backend automated tests:** **81 passed, 0 failed**.
- **Manual test:** A verified expired Stripe test checkout was reconciled; the order changed to _expired_ and the reserved product stock was restored.

The automated tests cover scenarios including authentication, access control, invalid requests, checkout concurrency, payment verification, signed webhooks, and inventory state transitions. These results describe the tested local version, not an independent production security certification.

## Security and reliability notes

- Password hashing and JWT-based authentication with server-side session handling.
- Role-based restrictions on protected API operations.
- Request validation and common HTTP security middleware.
- Stripe webhook signature verification before event processing.
- Checks that Stripe sessions match the expected order, amount, and currency.
- MongoDB transactions for multi-product inventory reservation and release.
- Inventory-state checks to help prevent double charging-related state changes, double reservation, or double release.
- Secret values are stored in local environment files excluded from version control.

**Important limitation:** The project includes a read-only pending-checkout report and automated tests for missed-webhook reconciliation. A continuously running, scheduled recovery process has **not been verified**. For a production deployment, webhook delivery, retry/reconciliation scheduling, monitoring, deployment configuration, and live-payment readiness must be reviewed separately.

## Screenshots

The project includes local UI pages for the storefront, product details, cart, account/orders, and admin interface. Add screenshots to this section when the image files are ready to commit; no screenshot links are included here yet to avoid broken references.

## Portfolio context

This project demonstrates practical work with a typed frontend and backend, database models, authenticated APIs, payment integrations, application security controls, transactional inventory management, and automated testing.
