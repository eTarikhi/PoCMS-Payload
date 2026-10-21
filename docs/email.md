# Transactional email and password resets

The application uses Payload's installed **3.90.2 Resend adapter**. This is not a
contact form or a new authentication system. Existing Payload reset-token generation,
expiry, password hashing, login and token invalidation remain authoritative.

## Production configuration

Set these privately in the deployment environment:

- `RESEND_API_KEY`: provider key. Never expose this in browser code or Git.
- `EMAIL_FROM_ADDRESS`: a sender/address verified in your Resend account.
- `EMAIL_FROM_NAME`: display name. CR/LF injection is rejected.
- `NEXT_PUBLIC_SITE_URL`: trusted canonical site origin, such as
  `https://portfolio.example`. This origin is public; it is not a secret.

Blank sender values preserve the existing `dev@vtarikhi.com` / `PoCMS` defaults.
Those defaults are **not proof that your deployment is permitted to send from that
address**. Verify the sender with the provider before testing real delivery.

Without a key, the configured adapter fails locally with a sanitized configuration
error. It does not issue an empty-key provider request, print email bodies/reset
links, or pretend delivery succeeded. Provider failures still propagate.

Reset emails use a custom Payload `generateEmailHTML` callback to build an absolute
link from the configured canonical origin and actual admin/reset routes. The link
never comes from an untrusted request Host header. The canonical origin must not
contain credentials, a subpath, query or fragment. HTTPS is required except for
`http://localhost` and `http://127.0.0.1` during local development. Invalid/missing
configuration fails rather than emailing a broken or attacker-controlled link.

The token is URL-encoded and the link is HTML-escaped. The template intentionally
does not put a reset token into logs. Keep deployment observability/redaction rules
from recording outbound transactional-email bodies or authentication tokens.

## Isolated verification (no external email)

Follow [integration testing](integration-testing.md), source its private environment
file, then run:

```sh
pnpm test:integration:email
```

This one-shot CLI requires the same disposable-loopback-database safety guard. It:

1. Uses a nonfunctional fixture API key and `.test` sender inside its own process.
2. Intercepts the configured Resend adapter's HTTP boundary in memory; unexpected
   fetch destinations are rejected. No real provider credential is read or used.
3. Creates a temporary user and invokes the real Payload forgot-password operation.
4. Checks the actual recipient, configured sender and absolute reset link privately.
5. Resets the password and authenticates with the new password.
6. Verifies rejection of the old password and replay of the single-use token.
7. Verifies an unknown account does not generate an email.
8. Deletes the temporary account, destroys Payload and exits after awaited cleanup.

It does not print messages, passwords, tokens or authenticated responses. Unit tests
also cover missing-key behavior, sender injection, provider failure and unsafe origins.
The integration configuration disables Payload telemetry so isolated verification
is not dependent on an unrelated external telemetry service.

Payload may still print its generic missing-request-origin warning in a standalone
Local API invocation before calling the custom template. The test separately asserts
that the final captured link is absolute and trusted. No global `serverURL` was added:
that would change generated local-media URLs and image-optimizer behavior elsewhere.

## What remains unverified

This verifies application behavior and adapter serialization, **not email delivery**.
With actual deployment credentials, separately check verified sender/DNS settings,
provider acceptance, inbox delivery/spam classification, link origin and expiry, and
user-facing recovery behavior. Remote provider endpoints are unavailable in this
sandbox and no real mailbox was contacted.

Version-matched references:

- [Payload email adapters](https://github.com/payloadcms/payload/blob/v3.90.2/docs/email/overview.mdx)
- [Authentication email customization](https://github.com/payloadcms/payload/blob/v3.90.2/docs/authentication/email.mdx)

No auth collection fields, password policy, migrations or public signup access were
changed by this feature.
