# Terminal security review (CR-12 E7)

The admin's **Terminal** page (`/admin/terminal`, `views/Terminal`) runs one of the project's
package scripts and streams its output. This note records the threat model, the controls and the
residual risks, as the roadmap requires before shipping the page.

**Verdict:** acceptable for development machines. The page is unavailable in production, requires
the `useTerminal` capability, and cannot run anything that is not compiled into the allow-list.
Residual risks are limited to a development server being reachable by more people than intended,
and to output that may quote environment-derived error text.

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
| Signed-in administrator / developer | Development only | Run a command other than the listed ones, inject arguments, read files, escalate | The request carries **one slug**; the command, arguments, working directory and environment come from the server (`scriptBySlug` → `commandFor`) |
| Malicious web page in the same browser (CSRF) | Development only | Trigger a command cross-site with the admin's cookie | The auth cookie is `SameSite=Lax`, so a cross-site `POST` does not carry it; the endpoint also requires `Content-Type: application/json`, which a cross-site form cannot send |
| Compromised dependency in a script | Development only | Anything the script can do | Same trust as running `pnpm <script>` by hand; the allow-list is short and reviewed |

## Controls

1. **Production gate.** `isTerminalEnabled()` returns false when `NODE_ENV === 'production'`. The
   view returns `notFound()` before any capability check, and the endpoint returns 404 before
   reading the body. A production build therefore has no terminal route and no terminal endpoint,
   even for administrators, and even if `TERMINAL`-style variables were added.
2. **Authentication and authorisation.** The endpoint reads the same cookie session as the admin
   (`req.user`) and requires the `useTerminal` capability (ADR 0011). Administrators hold every
   capability; other roles only if granted it. The page hides the navigation link without it.
3. **Allow-list, not a shell.** `TERMINAL_SCRIPTS` is a compiled array of `{ slug, args, timeoutMs }`
   entries. `commandFor()` always returns `pnpm run <compiled-name>`; the request body's `script`
   is looked up in that array and rejected with 400 otherwise (`tests/int/terminal.int.spec.ts`
   asserts every entry is a two-argument `pnpm run` of a `[a-z0-9:-]` name, and that `dev`,
   `start`, `build`, `seed`, `migrate` and `shell` are not on it).
4. **No shell.** `spawn(command, args, { shell: false, cwd: process.cwd(), stdio: [...] })`. The
   browser cannot influence the command, arguments, environment or working directory.
5. **Bounded runs.** Each script declares a timeout (2–15 minutes). On timeout the child gets
   `SIGTERM`, then `SIGKILL` after three seconds. A disconnected browser (`req.signal` abort, the
   Stop button, a reload) kills the child the same way. There is no queue and no persistence.
6. **No secret input.** The endpoint accepts no environment variables, file paths or URLs. Output
   is streamed as `text/plain; charset=utf-8` with `Cache-Control: no-store, no-transform` and
   `X-Content-Type-Options: nosniff`, and rendered inside a `<pre>` (text, never HTML), so command
   output cannot become executable markup.
7. **Colour and pager noise removed.** `FORCE_COLOR=0`, `NO_COLOR=1`, `PAGER=cat`,
   `GIT_PAGER=cat`, and `CI` is removed so the tools do not switch to CI reporters.

## Residual risks

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| The development server is exposed beyond localhost (a tunnel, `-H 0.0.0.0`, a shared machine) | Low | Medium | Anyone with an administrator session on that server can run the listed checks. Do not expose a development admin publicly; use the production build for previews, where the page is gone. |
| A command prints environment-derived error text (a connection error naming a host, a stack trace) into the log area | Medium | Low | The page is development only; secrets are not passed to any script; avoid running it while screen sharing. |
| A run consumes CPU for up to 15 minutes (`test:int`) | Low | Low | Timeouts, one process per request, Stop button; no automatic retries. |
| New script added carelessly | Low | High | Every entry is code-reviewed; the unit test enforces the shape and blocks destructive names. |

## Review checklist

- [x] Production returns 404 on the page and on the endpoint.
- [x] The capability is enforced on both, and the navigation link is hidden without it.
- [x] Only compiled slugs are accepted; no user input reaches `spawn`.
- [x] No shell; fixed `cwd`; no user-provided environment.
- [x] Timeout and disconnect both kill the child process.
- [x] Output is text, `no-store`, `nosniff`, and never `dangerouslySetInnerHTML`.
- [x] Unit tests for the allow-list and the production gate; endpoint tests for 403 and 400.
