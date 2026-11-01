# Rotating secrets

How to replace each secret ClearPaisa uses, and what breaks while you do.
Rotate one when it may have been seen by someone it shouldn't (pasted into a
chat, a ticket, a screenshot or a commit), when someone with access leaves, when
a provider reports a leak, or once a year anyway.

The general pattern: create the new value, put it everywhere the old one is,
redeploy, check, then revoke the old one. Where the provider allows two at once
(Google, the AI providers, Sentry), there's no gap. Where it doesn't (the
database password, Razorpay keys), do it at a quiet hour, quickly.

Settings in Vercel take effect only with a new deployment: after changing them,
**Deployments → the latest Production deployment → ⋯ → Redeploy**. Mark secrets
**Sensitive** in Vercel when you add them, so they can't be read back.

Never paste a secret into a chat (including with a coding agent), an issue or a
terminal command that lands in your shell history. To use one in a terminal,
`read -rs NAME` and paste it at the prompt.

## At a glance

| Secret                                                             | Where it lives                                                | While rotating                                                 |
| ------------------------------------------------------------------ | ------------------------------------------------------------- | -------------------------------------------------------------- |
| Database password (`DATABASE_URL`, `DATABASE_URL_UNPOOLED`)        | Neon; Vercel; GitHub environment `production-backup`          | the site can't reach the database until Vercel is updated      |
| `BETTER_AUTH_SECRET`                                               | Vercel                                                        | everyone is signed out once                                    |
| `GOOGLE_CLIENT_SECRET`                                             | Google Cloud; Vercel                                          | nothing, if the old one is disabled last                       |
| `CRON_SECRET`                                                      | Vercel (or your server)                                       | a run may be refused; the app catches up when someone opens it |
| AI keys (`LLM_*_API_KEY`)                                          | each provider; Vercel                                         | nothing; the other providers cover the gap                     |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET`                          | Razorpay; Vercel                                              | checkout fails until Vercel is updated                         |
| `RAZORPAY_WEBHOOK_SECRET`                                          | Razorpay; Vercel                                              | webhooks are refused briefly; Razorpay retries them            |
| `SENTRY_AUTH_TOKEN`                                                | Sentry; Vercel                                                | nothing (it's used only while building)                        |
| Sentry DSN key (`NEXT_PUBLIC_SENTRY_DSN`, the backup check-in URL) | Sentry; Vercel; GitHub environment `production-backup`        | events from the old key are dropped once it's disabled         |
| `BACKUP_PASSPHRASE`                                                | GitHub environment `production-backup`; your password manager | nothing; keep the old one 7 days for the older backups         |

## Database password

The password is part of both connection strings. Neon can't hold two passwords
for one role, so the site is down for the minute between resetting it and the
redeploy finishing.

1. Neon → the project → **Branches** → the production branch → **Roles** →
   the app's role → **Reset password** (menu names may have moved). Copy the new connection strings from
   **Connect** (pooling on for `DATABASE_URL`, off for `DATABASE_URL_UNPOOLED`).
   Use `sslmode=verify-full` in both (and `&sslrootcert=system` in the one for
   GitHub; see [DEPLOY.md](DEPLOY.md#5-backups)).
2. Vercel → **Settings → Environment Variables**: update both, then redeploy.
   (If Neon's Vercel integration manages them, it may already have.)
3. GitHub → **Settings → Environments → `production-backup`**: update
   `DATABASE_URL_UNPOOLED`.
4. Check: `/api/health` answers `"ok":true`; **Actions → Nightly database backup →
   Run workflow** on `main` succeeds.

If the password leaked, also look in Neon's **Monitoring** for connections you
don't recognise, and compare user and entry counts with yesterday's backup
([RESTORE.md](RESTORE.md)).

## `BETTER_AUTH_SECRET`

It signs the sign-in cookies. A new one makes every existing cookie invalid, so
everyone (you included) signs in with Google again; no data is lost.

1. `openssl rand -base64 32`, then set it in Vercel and redeploy.
2. Check: sign in on the live site.

The old sessions stay in the database until they expire; without the old secret
nobody can use them. To clear them anyway, run `delete from session;` in Neon's
SQL Editor on the production branch.

## `GOOGLE_CLIENT_SECRET`

1. Google Cloud console → **APIs & Services → Credentials** → the OAuth client →
   **Add secret**. Both secrets work until you disable one.
2. Set the new one in Vercel and redeploy. Sign in on the live site.
3. Back in the OAuth client, disable, then delete, the old secret.

## `CRON_SECRET`

1. `openssl rand -hex 32` (at least 24 characters, or the job stays off).
2. Set it in Vercel and redeploy; Vercel's cron sends it by itself. On your own
   server, update the app's `CRON_SECRET` in Coolify; the hourly task reads it.
3. Check: `/admin` setup checks show CRON_SECRET as set; the next morning the
   cron monitor in Sentry shows an OK run.

## AI provider keys

For each of `LLM_GROQ_API_KEY`, `LLM_CEREBRAS_API_KEY`, `LLM_OPENROUTER_API_KEY`
(and `LLM_GROQ_PAID_API_KEY` if you use one):

1. Create a new key in the provider's console (links in `.env.example`).
2. Set it in Vercel and redeploy.
3. Check: `/admin` → AI providers shows recent successes for that provider. Then
   delete the old key in the provider's console.

## Razorpay keys (only while payments are on)

Razorpay's **Regenerate** replaces the key at once, so checkout fails until the
redeploy finishes. Do it when nobody is likely to be paying.

1. Razorpay Dashboard → **Account & Settings → API Keys** → **Regenerate**.
2. Set `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` in Vercel and redeploy.
3. Check: `/admin` setup checks; a test-mode purchase if you're in test mode.

## `RAZORPAY_WEBHOOK_SECRET`

1. `openssl rand -hex 32`.
2. Razorpay Dashboard → **Webhooks** → the ClearPaisa webhook → edit → set the
   new secret; at the same time, set it in Vercel and redeploy.
3. Webhooks that arrive in between fail the signature check. Razorpay retries
   them, and the app also asks Razorpay's API directly when someone starts a
   checkout or is waiting for a payment to be confirmed.

## `SENTRY_AUTH_TOKEN`

1. Sentry → **Settings → Auth Tokens** → create an organization token.
2. Set it in Vercel (Sensitive) and redeploy; check the build log uploads source
   maps.
3. Revoke the old token in Sentry.

## Sentry DSN key

The DSN is public by design (browsers use it to send errors), so rotate it only
if someone floods your project with fake events.

1. Sentry → the project → **Client Keys (DSN)** → **Generate New Key**.
2. Set `NEXT_PUBLIC_SENTRY_DSN` in Vercel and redeploy (it's read while
   building). The backup check-in URL contains the key too: create it again from
   the `nightly-backup` monitor and update `SENTRY_BACKUP_CHECKIN_URL` in the
   GitHub environment `production-backup`.
3. Disable the old key.

## `BACKUP_PASSPHRASE`

1. Make a new long random phrase and save it in your password manager **next
   to** the old one.
2. GitHub → **Settings → Environments → `production-backup`**: update
   `BACKUP_PASSPHRASE`. Run the backup once by hand and check it succeeds.
3. The backups from before stay encrypted with the old phrase. Delete the old
   phrase only after 7 days, when the last of them has expired.

## After a leak

1. Rotate first, then investigate.
2. Remove the secret from wherever it was exposed if you can: delete the
   message, edit the issue, remove it from shell history (`history -d <number>`
   in bash; in zsh, edit `~/.zsh_history`). A committed secret stays in git
   history: rotating is the fix, not rewriting history.
3. Look for misuse: Neon monitoring, Vercel logs, Sentry, the AI providers'
   usage pages, Razorpay's dashboard.
4. Write down what happened and when in
   [known-issues.md](project-memory/known-issues.md#operations).
