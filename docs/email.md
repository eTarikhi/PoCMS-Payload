# Email

How this site sends email: which provider, what it sends, the two guards that keep a development
environment from emailing real people, and the log that answers "did it go out?".

Everything lives in `src/email/`, the log is the `email-logs` collection, and the admin page is
`/admin/email` (the `manageEmails` capability). Payload's own docs for the underlying API are
[Email functionality](https://payloadcms.com/docs/email/overview) and
[Authentication email](https://payloadcms.com/docs/authentication/email); this page is about what
PoCMS builds on top of them and why.

## The short version

```bash
# .env — a provider, and who it sends as
RESEND_API_KEY=re_…
EMAIL_FROM_ADDRESS=no-reply@your-domain.com
EMAIL_FROM_NAME="PoCMS"

# .env — locally, so nothing real is contacted
EMAIL_OVERRIDE_RECIPIENT=you@example.com     # every message goes here instead
EMAIL_DISABLED=true                          # or send nothing at all, and log the attempt
```

Then open `/admin/email`, press **Send it**, and read the log row that appears.

## Which provider sends

Chosen once, when the config is built (`src/email/settings.ts` reads the environment;
`src/email/provider.ts` builds the adapter, and it is the only module that imports a provider
package — so the admin page can describe the configuration without pulling `nodemailer` into a graph
Next.js bundles for the browser):

| Order | Condition | Provider |
| --- | --- | --- |
| 1 | `EMAIL_PROVIDER` names one | that one (`resend`, `nodemailer`, `console`) |
| 2 | `RESEND_API_KEY` is set | Resend — a REST call, which is what a serverless function wants, and what the Payload docs recommend for Vercel |
| 3 | `SMTP_HOST` is set | nodemailer over SMTP (`SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_SECURE`) |
| 4 | neither | a log-only adapter, and `configured: false` |

Case 4 is the one worth explaining. Payload's own behaviour when email is not configured is a warning
at startup and a log line per attempt — right for a library, wrong for a site, because the first
person to notice is somebody who asked for a password reset and did not get one. So the situation is
stated on `/admin/email` in one red line ("No provider is configured (no RESEND_API_KEY, no
SMTP_HOST), so email is logged and not sent"), the page shows whether each credential is present
without ever showing its value, and every attempt is still recorded.

A provider can also be *misconfigured* rather than absent: `EMAIL_PROVIDER=resend` with no key, or
`EMAIL_PROVIDER=nodemailer` with no host. Both are reported the same way, because both mean nothing
will be delivered.

`EMAIL_FROM_ADDRESS` and `EMAIL_FROM_NAME` default to `dev@vtarikhi.com` and `PoCMS`. The **site
name**, the **reply-to address** and the **public origin** the links point at are read from
**Site settings** (`siteName`, `supportEmail`) and `NEXT_PUBLIC_SITE_URL` at send time, so a rename
does not need a deploy (`src/email/brand.ts`). A missing `NEXT_PUBLIC_SITE_URL` is called out on the
page: a reset email whose link points nowhere is a lockout.

## The two development guards

Both sit in the wrapper around the provider, so they apply to *every* message — this site's templates
and Payload's own auth emails alike — rather than to the call sites that remembered them.

| Variable | Effect | Recorded as |
| --- | --- | --- |
| `EMAIL_OVERRIDE_RECIPIENT` | Every message goes to that address instead. The log keeps the address it was really for. | `redirected` |
| `EMAIL_DISABLED` | Nothing is sent. The attempt is still recorded. | `skipped` |

A redirect that is not logged is a redirect nobody notices, so the log row carries both addresses and
the page shows the badge. This is also why the guards are not left to the provider's own
`overrideRecipientAddress` option (Resend and nodemailer both have one): that redirect happens below
the log.

## What gets sent

| Template | Slug | When |
| --- | --- | --- |
| Password reset | `forgot-password` | Payload's `forgotPassword` operation, through `auth.forgotPassword.generateEmailHTML` |
| Address verification | `verify-email` | Only if `auth.verify` is turned on — it is not, and turning it on would ask every existing account to confirm before signing in. The generators are wired and waiting |
| Account created | `welcome` | An administrator creates somebody's account (`src/email/hooks.ts`) |
| Test | `test` | The **Send a test** button on `/admin/email` |
| Maintenance digest | `digest` | The shape a scheduled report takes; nothing sends it yet |

Every template is a pure function of its data and the brand, returning a subject, an HTML body and a
hand-written plain-text body. The text version is not stripped from the markup: a reset link buried in
HTML is a link nobody can click in a terminal mail client.

The HTML is written the way email has to be written and not the way the rest of this repository is:
tables for layout, inline styles on every element, no stylesheet, no script, no external image. Gmail
strips `<style>` in some contexts and Outlook still renders with the Word engine. Nothing is shared
with the admin UI for that reason.

Every interpolated value goes through `escapeHtml`, and only `http(s)` URLs reach an `href`. The
values are a person's name, a site name an editor typed and a subject line — all of which can contain
`<`, and an unescaped one is an email whose layout is decided by its own content. A test renders every
template with hostile data and asserts none of it survives.

### Replacing Payload's auth emails

Payload generates the verification and password-reset messages and offers four hooks per collection
(`src/collections/Users.ts`):

```ts
auth: {
  forgotPassword: {
    generateEmailHTML: generateForgotPasswordEmailHTML,
    generateEmailSubject: generateForgotPasswordEmailSubject,
  },
}
```

They are config options, not a patch: Payload sends whatever they return through the configured
adapter. What the defaults lack, and what these add: a link built from the *configured* public origin
rather than the request's (which behind a proxy or on a preview deployment can be an address the
reader cannot reach), a plain-text body, the site's own name, and a line saying what to do if the
reader did not ask for the email.

### Inviting somebody

Payload creates a user and says nothing. `inviteNewUser` (an `afterChange` hook) closes that gap, and
tells two cases apart:

- **No password was supplied** (the API, a seed, an integration): the hook asks Payload for a reset
  token with `disableEmail: true` — so Payload's own email does not go out beside this one — and sends
  `welcome` with a link to choose a password. The password never exists in anybody's head or inbox.
- **A password was supplied** (the admin panel's create form asks for one): the same template without
  a token, telling the person to sign in with what they were given and change it. Overriding an
  administrator's choice with a reset link would be surprising.

It stays quiet about: an update, a person creating their own account, a create with no request behind
it (the `admin:create` script and first-user setup, where a human chose the password at a terminal),
and a collection with `auth.verify` on (Payload's verification email covers it). The send never
throws, so a provider that is down cannot stop an administrator creating an account — the failure is
in the log.

## Sending from your own code

```ts
import { sendTemplate } from '@/email/send'

const result = await sendTemplate(payload, {
  template: 'digest',
  to: 'ops@example.com',
  req,                                  // who asked for it, when a person did
  data: { runs, period: 'the last day' },
  context: { jobRun: run.id },          // kept beside the log row; never a body
})

if (!result.ok) payload.logger.warn({ msg: 'The digest did not go out', error: result.error })
```

`sendTemplate` renders the template, attaches the headers the logging wrapper reads, sends through
`payload.sendEmail`, and returns the outcome. **It does not throw**: a notification is a side effect of
something that mattered more — an account was created, a job finished — and if the provider is down the
account should still exist, with the failure in the log and in the result.

Payload's own auth emails are the exception and do not come through here. `forgotPassword` tells its
caller when the email failed, because "we sent you a link" would otherwise be a lie.

To preview without sending: `previewTemplate(payload, slug, data)`.

## The log

`email-logs` holds one document per attempt, written by the wrapper around the provider
(`src/email/adapter.ts`) — which is why it contains Payload's own auth emails and not only this site's
templates. The full list is the **Email log** collection in the sidebar; the page shows the last 15.

| Field | What it is |
| --- | --- |
| `status` | `sent`, `redirected`, `skipped` or `failed` |
| `template` | Which template produced it, or `payload` for a send that is not one of ours |
| `to`, `redirectedFrom` | Where it went, and where it was meant for when a guard redirected it |
| `subject`, `from`, `provider`, `messageId` | Enough to find it in the provider's dashboard |
| `error` | The provider's own words when it refused, or why nothing was sent |
| `bytes`, `durationMs` | Size and how long the provider took |
| `triggeredBy`, `context` | Who asked for it, and whatever the caller kept beside it |

**The body is never stored, and no flag turns that on.** A password-reset email carries a live token in
its HTML, so a log that kept bodies would let anybody who can read the log take over that account — a
much wider audience than the token was ever meant for. The size is recorded instead, which is what a
deliverability question actually needs.

Nobody writes a row through the API (`create` and `update` are `false`): the wrapper uses the Local API
with `overrideAccess`, so the document is a truthful account of what happened rather than something an
administrator can tidy up. Reading and deleting need the `manageEmails` capability.

A log write that fails is logged and swallowed — the email went (or did not) either way, and the usual
cause is a database without the collection yet. A send that fails is recorded and **re-thrown**, so a
caller is never told a send worked when it did not.

## The admin page

`/admin/email` (`src/components/admin/views/Email/`):

| Card | What it does |
| --- | --- |
| Delivery | Provider, From, reply-to, site name, where links point, whether each credential is present (never its value), the redirect, the environment. Red when nothing will be delivered. |
| Send a test | One real send through the provider, to your own address by default, with the outcome — including "redirected" and "not sent, EMAIL_DISABLED is set" rather than a spinner that stops. |
| Templates | Every template rendered with its sample data, exactly as a send renders it (fetched from the server, not a copy in the browser), as delivered HTML in a sandboxed iframe and as plain text. |
| Recent sends | The last 15 log rows, with the failure beside the subject and the address a redirect stood in for. |

Endpoints behind it, all gated by `manageEmails`:

| Endpoint | Answer |
| --- | --- |
| `GET /api/email/status` | The configuration (no credential values), the brand, the templates, the last 10 sends, and a count per status |
| `GET /api/email/templates` | Every template, or `?template=<slug>`, rendered with its sample data |
| `POST /api/email/test` | `{ to?, template?, data? }` → sends one; `400` for an address that is not an address, `502` when the provider refuses |

## Adding a template

1. Write it in `src/email/templates.ts`: a slug, a label, a description, sample data for the preview,
   and a `render(brand, data)` returning `{ subject, html, text }`. Use `renderEmailLayout` for the
   document and `escapeHtml` for every value. Add it to `EMAIL_TEMPLATES`.
2. Give the layout call `template: '<slug>'`. That marker is how the log attributes a send Payload made
   itself, where there is no header to attach.
3. Run `pnpm generate:types` — the log's `template` select is generated from the slug list, so a new
   template needs a migration for the enum value:
   `ALTER TYPE "public"."enum_email_logs_template" ADD VALUE IF NOT EXISTS '<slug>';`
4. Send it with `sendTemplate`. It appears in the preview and in the test-send list with no further
   wiring.

## What this does not do

- **No queue and no retry.** A send is one request to a provider inside the request that needed it.
  Retries belong in a job, and the jobs queue is where a digest or a re-send would go; nothing here
  silently retries a provider that refused.
- **No unsubscribe or list management.** These are transactional messages (a reset, an invitation, a
  test), not marketing. A newsletter needs a list, a consent record and an unsubscribe link, which is a
  different feature and a different legal question.
- **No inbound email.** Nothing parses replies.
- **No per-message attachments yet.** `payload.sendEmail` accepts them and the provider adapters
  support them (Resend wants base64 or a URL; nodemailer accepts a path or a Buffer), so a template
  that needs one passes `attachments` through `sendTemplate`'s message — but no template here does.
- **No rate limiting of its own.** Payload's `minRequestInterval` (15 s by default) already bounds
  password-reset emails per user; a provider's own limits are the provider's.
