# Terminal security review (CR-12 E7)

The admin's **Terminal** page (`/admin/terminal`, `views/Terminal`) runs one of the project's
package scripts and streams its output. This note records the threat model, the controls and the
residual risks, as the roadmap requires before shipping the page.

**Verdict:** acceptable for development machines. The page is unavailable in production, requires
the `useTerminal` capability, and cannot run anything that is not compiled into the allow-list.
Some entries run through a shell (control 4) — safe because the shell only ever sees literals, but
worth knowing when reviewing a new entry. One entry (`seed-load`) changes database rows and is
labelled as such in the UI. Residual risks are otherwise limited to a development server being
reachable by more people than intended, and to output that may quote environment-derived error
text.

## Scope

| Part | File |
| --- | --- |
| Allow-list (the only commands) | `src/terminal/scripts.ts` |
| Streaming endpoint | `src/endpoints/devTerminal.ts`, mounted at `POST /api/dev/terminal` |
| Page and client console | `src/components/admin/views/Terminal/*` |
| Capability | `useTerminal` in `src/access/permissions.ts` |

## Threat model

| Actor | Reach | What they could try | Control |
| --- | --- | --- | --- |
| Anonymous internet user | Any deployment | Call the endpoint, open the page | `NODE_ENV === 'production'` → 404 before authentication; in development, no session → `hasCapability` is false → 403 and the page redirects to the login screen |
| Signed-in editor without the capability | Development only | Open the page or call the endpoint | `hasCapability(req.user, 'useTerminal')` → 404 on the page, 403 on the endpoint; the sidebar link is not rendered |
| Signed-in administrator / developer | Development only | Run a command other than the listed ones, inject arguments or shell metacharacters, read files, escalate | The request carries **one slug**; the command, arguments, working directory, `shell` flag and environment come from the server (`scriptBySlug` → `commandFor`). Script names match `^[a-z0-9:-]+$`, so no metacharacter can reach a shell even from a careless allow-list edit |
| Malicious web page in the same browser (CSRF) | Development only | Trigger a command cross-site with the admin's cookie | The auth cookie is `SameSite=Lax`, so a cross-site `POST` does not carry it; the endpoint also requires `Content-Type: application/json`, which a cross-site form cannot send |
| Compromised dependency in a script | Development only | Anything the script can do | Same trust as running `pnpm <script>` by hand; the allow-list is short and reviewed |

## Controls

1. **Production gate.** `isTerminalEnabled()` returns false when `NODE_ENV === 'production'`. The
   view returns `notFound()` before any capability check, and the endpoint returns 404 before
   reading the body. A production build therefore has no terminal route and no terminal endpoint,
   even for administrators, and even if `TERMINAL`-style variables were added.
   Verified against `next start`: `POST /api/dev/terminal` answers a real `404`, and
   `GET /admin/terminal` serves the admin shell with `notFound()` in its React Server Component
   payload (`NEXT_HTTP_ERROR_FALLBACK;404`, so the browser renders Next's 404 view). The streamed
   shell itself goes out with status 200 because Next has already sent the headers, but it carries
   no allow-list data at all: no slugs, no descriptions, no `timeoutSeconds` and no reference to the
   `Console` chunk. The commands are server-only in either case, so nothing is gained by loading
   the page.
2. **Authentication and authorisation.** The endpoint reads the same cookie session as the admin
   (`req.user`) and requires the `useTerminal` capability (ADR 0011). Administrators hold every
   capability; other roles only if granted it. The page hides the navigation link without it.
3. **Allow-list, not free-form commands.** `TERMINAL_SCRIPTS` is a compiled array of
   `{ slug, args, timeoutMs, writes?, database?, shell? }` entries. `commandFor()` always returns
   `pnpm run <compiled-name>` — **exactly two arguments** — and the request body's `script` is
   looked up in that array and rejected with 400 otherwise. A command that needs a flag therefore
   gets a package.json script with the flag baked in (`db:schema-from:neon`, `db:seed-from:neon`,
   `db:seed-load`); the browser never supplies one. `tests/int/terminal.int.spec.ts` asserts every
   entry is a two-argument `pnpm run` of a `[a-z0-9:-]` name that exists in package.json, and that
   `dev`, `start`, `build`, `seed`, `migrate` and `shell` are not on it.
4. **A shell over literals only.** `spawn(command, args, { shell, cwd: process.cwd(), stdio: [...] })`,
   where `shell` is the entry's own flag (`commandFor` returns it; nothing else can set it, and the
   endpoint no longer hard-codes a value). Entries opt in when the script they run needs one —
   `pnpm run` resolving a script that calls `cross-env`, exactly as `POST /api/dev-migrate` runs
   `payload migrate:create … --force-accept-warning`. This is safe because the shell's whole command
   line is compiled: two arguments, both literals, the second constrained to `[a-z0-9:-]`, so there
   is no interpolation, no quoting difference and no metacharacter to exploit. The browser cannot
   influence the command, arguments, environment, working directory or the `shell` flag itself.
   Reviewing a new entry means reading the package.json script it names — that script's own
   arguments are now part of the trusted surface.
5. **Bounded runs.** Each script declares a timeout (2–15 minutes). On timeout the child gets
   `SIGTERM`, then `SIGKILL` after three seconds. A disconnected browser (`req.signal` abort, the
   Stop button, a reload) kills the child the same way. There is no queue and no persistence.
6. **No secret input.** The endpoint accepts no environment variables, file paths or URLs. Output
   is streamed as `text/plain; charset=utf-8` with `Cache-Control: no-store, no-transform` and
   `X-Content-Type-Options: nosniff`, and rendered inside a `<pre>` (text, never HTML), so command
   output cannot become executable markup.
7. **The UI says what a command does.** Each entry may declare `writes` (creates or changes files in
   the checkout) and `database` (changes rows). The console prints an amber warning for the first
   and a red one for the second before running, so `seed-load` — which replaces the rows of the
   tables its file names — cannot be started by accident. Both flags are server-side: `optionsFor()`
   sends them to the client, never `shell`.
8. **Colour and pager noise removed.** `FORCE_COLOR=0`, `NO_COLOR=1`, `PAGER=cat`,
   `GIT_PAGER=cat`, and `CI` is removed so the tools do not switch to CI reporters.

## Residual risks

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| The development server is exposed beyond localhost (a tunnel, `-H 0.0.0.0`, a shared machine) | Low | Medium | Anyone with an administrator session on that server can run the listed checks. Do not expose a development admin publicly; use the production build for previews, where the page is gone. |
| A command prints environment-derived error text (a connection error naming a host, a stack trace) into the log area | Medium | Low | The page is development only; secrets are not passed to any script; avoid running it while screen sharing. |
| A run consumes CPU for up to 15 minutes (`test:int`) | Low | Low | Timeouts, one process per request, Stop button; no automatic retries. |
| New script added carelessly | Low | High | Every entry is code-reviewed; the unit test enforces the shape, the name regex, the two-argument rule and that the named script exists in package.json. |
| An entry names a package.json script that is later edited to do something destructive | Low | High | `shell: true` makes the named script's own command line part of the trusted surface. Keep the database scripts argument-free and single-purpose; review changes to `db:*` scripts as changes to the Terminal. |
| `seed-load` replaces the rows of the tables its snapshot names | Medium (development) | Medium | Red warning in the console; development builds only; one transaction, so an interrupted run rolls back; the snapshot file is reviewed before it is loaded and is not committed silently. |

## Review checklist

- [x] Production returns 404 on the page and on the endpoint.
- [x] The capability is enforced on both, and the navigation link is hidden without it.
- [x] Only compiled slugs are accepted; no user input reaches `spawn`.
- [x] No user input reaches the command line: two compiled arguments, `[a-z0-9:-]` names that exist
      in package.json; a shell is used only over those literals, per entry.
- [x] Fixed `cwd`; no user-provided environment; `shell` is server-side only (`optionsFor` omits it).
- [x] File-writing and database-writing entries are flagged and warned about in the console.
- [x] Timeout and disconnect both kill the child process.
- [x] Output is text, `no-store`, `nosniff`, and never `dangerouslySetInnerHTML`.
- [x] Unit tests for the allow-list and the production gate; endpoint tests for 403 and 400.
