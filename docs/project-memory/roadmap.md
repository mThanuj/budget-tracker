# Roadmap

Future work, split by whether the owner has approved it. Fixes and debt live in
[known-issues.md](known-issues.md), not here. Move an item to "Approved" only
when the owner says so, and to [changelog.md](changelog.md) when it's done.

## Approved direction (no date set)

- **Turn payments on.** `BILLING_ENABLED=true`, Razorpay live mode (KYC and
  their website review), and move hosting to an own server (Hetzner + Coolify,
  the `Dockerfile`), since Vercel's free plan isn't for commercial use.
  Decisions D-008, D-009, D-010; steps in [docs/DEPLOY.md](../DEPLOY.md) Part 2.

## Proposed, not yet approved

Suggested after the launch (2026-10-24); the owner chose to keep them aside.

- Try a restore from a nightly backup once: now tracked as a high-priority
  open issue in [known-issues.md](known-issues.md#operations).
- Backup AI provider keys (Cerebras, OpenRouter): configuration only, the
  fallback chain already supports them.
- A legal review of the policy pages.
