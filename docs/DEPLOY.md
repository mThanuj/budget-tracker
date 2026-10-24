# Deploying ClearPaisa

One Hetzner Cloud server running [Coolify](https://coolify.io), which builds the
`Dockerfile` from GitHub on every push to `main`, serves it over HTTPS and runs
the hourly job. The database is Neon (Postgres). Do the steps in order.

## 1. Accounts and a domain

- **Domain**: buy it (e.g. `clearpaisa.in`) at any registrar. You'll add one DNS record in step 3.
- **Neon**: create a separate project for production (don't reuse the dev database),
  region **AWS Asia Pacific (Singapore)**. Copy both connection strings: pooled
  (`DATABASE_URL`) and direct (`DATABASE_URL_UNPOOLED`).
- **Hetzner Cloud**: a server in **Singapore**, Ubuntu LTS, 4 GB RAM or more (the
  image is built on the server), with your SSH key. Add a Hetzner firewall that
  allows only 22, 80, 443 and, until Coolify has a domain, 8000.

## 2. Coolify

On the server, as root:

```sh
curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash
```

Open `http://<server-ip>:8000`, create the admin account, and turn on
notifications (email or Discord) for failed deployments. Then:

1. **Sources → GitHub App**: connect it to the `budget-tracker` repository.
2. **New resource → Application** from that repo, branch `main`, build pack **Dockerfile**, port **3000**.
3. **Health check**: path `/api/health`, port 3000.
4. **Domains**: `https://<your-domain>`. Coolify gets the HTTPS certificate.

## 3. DNS

At your registrar, add an `A` record for the domain pointing at the server's IP.
Wait until `https://<your-domain>` loads before the next steps.

## 4. Environment variables

In the application's **Environment Variables**, add everything from
`.env.example` with production values:

- `DATABASE_URL`, `DATABASE_URL_UNPOOLED`: the production Neon project.
- `BETTER_AUTH_URL=https://<your-domain>` and a **new** `BETTER_AUTH_SECRET` (`openssl rand -base64 32`).
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`: see step 5.
- `CRON_SECRET` (`openssl rand -hex 32`).
- The AI block (`LLM_*`, `AI_GLOBAL_DAILY_LIMIT`).
- `RAZORPAY_*`: test-mode keys first (step 7).
- `ADMIN_EMAILS`, `LEGAL_NAME`, `SUPPORT_EMAIL`, `SUPPORT_PHONE`, `BUSINESS_ADDRESS`, `LEGAL_CITY`.

Deploy. On start the app applies database migrations by itself
(`RUN_MIGRATIONS=1` in the image). If one fails, the new version doesn't start
and the old one keeps serving; the log shows why.

## 5. Google sign-in

In Google Cloud Console → APIs & Services:

- **Credentials**: an OAuth client (Web) for production with the authorized JavaScript
  origin `https://<your-domain>` and the redirect URI
  `https://<your-domain>/api/auth/callback/google`.
- **OAuth consent screen**: app name ClearPaisa, home page, privacy
  (`/privacy`) and terms (`/terms`) links, your domain as an authorized domain.
  Then **Publish app** so it's "In production" (only basic scopes are used, so
  no review is needed).

## 6. Hourly job and backups

- **Coolify → the application → Scheduled Tasks**: every hour (`0 * * * *`):

  ```sh
  wget -qO- --header="Authorization: Bearer $CRON_SECRET" http://127.0.0.1:3000/api/cron/recurring
  ```

- **Backups** (on the server, as root; see the comments in `deploy/backup.sh`):
  install the script, put `DATABASE_URL_UNPOOLED` in `/etc/clearpaisa-backup.env`,
  and add the cron entry. Run it once by hand, then try a restore into a
  throwaway Neon branch so you know it works.

## 7. Razorpay

1. **Test mode first, on the live site**: test keys and test plans in the env
   vars. Under **Webhooks**, add `https://<your-domain>/api/webhooks/razorpay`
   with the `subscription.*` events, set a secret, and put the same secret in
   `RAZORPAY_WEBHOOK_SECRET`. Buy Pro with a test payment, cancel it, and check
   that the webhook deliveries show as successful.
2. **Live mode**: complete KYC and ask for website activation (Razorpay reviews the
   site, including the Privacy, Terms, Refunds and Contact pages and the pricing on
   the home page). Then, in live mode, create the two plans again (₹79 monthly,
   ₹799 yearly), generate live keys, add the live webhook, and replace all five
   `RAZORPAY_*` values.

## 8. Before you announce it

- [ ] `/admin` setup checks are all green (live Razorpay, webhook secret, CRON_SECRET, legal details, https).
- [ ] Sign in on the live site with a second Google account (consent screen shows ClearPaisa).
- [ ] Add an entry by typing a note; ask a question in Ask.
- [ ] The hourly task shows a successful run in Coolify.
- [ ] Last night's backup exists and a restore was tried.
- [ ] Uptime monitor (any free one) on `https://<your-domain>/api/health`.
- [ ] Server: `unattended-upgrades` on for security updates; SSH by key only.
- [ ] Check each AI provider's terms allow commercial use on its free tier, or move to paid keys.
- [ ] Ask an accountant about GST once revenue grows.
- [ ] Have the legal pages reviewed if you can; they're written in plain English, not by a lawyer.
- [ ] Watch `/admin` for "two renewing subscriptions" (someone who paid twice in two tabs); cancel and refund one from the Razorpay dashboard.
