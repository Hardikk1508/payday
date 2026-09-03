"""Real outreach delivery, via Resend.

Same shape as app/llm and app/db: `is_configured()` gated before every call,
no crash without a key, and this is wired to one deliberate endpoint
(POST /send-outreach-email) rather than anywhere in the simulated
5,000-customer loop -- that cohort's addresses are all @example.com,
reserved by IANA and unable to receive mail. Sending is something a human
triggers for a specific, real recipient after reviewing the generated copy,
not something that happens automatically.
"""
