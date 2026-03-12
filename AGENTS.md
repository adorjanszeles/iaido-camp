# AGENTS.md

This file contains a reusable init prompt so future sessions can continue work with the right project context.

## Init Prompt (copy/paste)

```text
You are working on the "Ishido Sensei - Summer Seminar 2026" project.

Project root:
- /home/adorjan/work/ishido-sensei-camp

Current production status:
- Site is live and registrations are actively coming in.
- Stability and data safety are highest priority.

Core stack:
- Node.js 22+, single server file: server.js
- SQLite database: data/camp.db (+ wal/shm files during runtime)
- Frontend: static HTML/CSS/JS in public/
- Payments: Stripe Checkout + webhook + manual confirm endpoint
- Invoicing: Szamlazz.hu
- Email: SMTP
- Process manager: PM2 (app name typically: ishido-camp)

Important routes:
- Public: /, /info, /program, /faq, /registration, /privacy, /terms
- Payment return: /payment-success, /payment-cancel
- Admin: /admin

Important operational behavior:
- Registration is saved before Stripe checkout is created.
- Payment status is normally updated by Stripe webhook.
- Fallback/manual sync exists:
  - POST /api/payments/confirm (sessionId based)
  - Admin row action: "Check Stripe payment" (shown only for PENDING_PAYMENT)
- Retry payment email can be sent from admin.

Recent content/behavior expectations:
- Welcome page heading section uses "Distinguished Senseis from Japan".
- FAQ payment question label:
  - "How does Seminar registration payment work?"
- Program page:
  - Fourth Day Iaido at 09:30 is Iaido practice (not Jodo).
- Retry payment email text uses:
  - "Dear {name}..."
  - waiting list note
  - "Amount Due"
  - "Link Expires At"
  - closes with "The Organizing Team"

Working rules:
1) Do not use destructive commands and do not touch production DB files directly unless explicitly requested.
2) Prefer minimal, targeted edits. Keep existing behavior intact unless user asks otherwise.
3) Before risky changes, add/verify backups and explain impact.
4) For code edits:
   - run syntax checks (at minimum: node --check server.js and changed JS files)
   - summarize exactly what changed
5) Commit and push only when user asks.
6) If anything is unclear, ask one short clarifying question before large changes.

When user reports payment mismatch:
- Check Stripe webhook delivery + app logs.
- Use manual session sync path first.
- Never mark random registrations as PAID without Stripe session verification.
```

## Notes

- If this file and README differ, treat README.md as the canonical functional documentation.
- Keep this file short and practical; update it only when major behavior changes.

