# Phase 2A.2 — Owner-Side Neon Validation Runbook

This runbook provisions a test target that is separate from the application's Neon project, checks
that target is empty, and runs the existing fail-closed Neon integration suite from Windows 11 and
PowerShell. It does **not** claim that live Neon validation has already passed.

## Safety summary

- Prefer a **new, dedicated Neon Project**. Do not create the test branch from the application's
  production or normal development project, and do not restore/import production data into the test
  project.
- The harness still requires a **non-default, unprotected branch** inside the test project. Create
  a child branch from the new project's own default branch; do not use that default branch as the
  test target.
- Before Payload is imported, the harness checks the supplied IDs and makes read-only Neon control
  plane lookups. It only then replaces `POSTGRES_URL` in the Vitest process with the verified test
  URL and allows schema push. The normal application URL is parsed locally and its endpoint
  metadata is read; the harness does **not** open a PostgreSQL connection to that URL or send the
  URL/credentials to Neon’s API.
- Do not run `pnpm test:int`, `pnpm test`, `pnpm dev`, `pnpm seed`, or migration/optimization
  commands from a shell where `POSTGRES_URL` identifies the normal application database. The
  generic `test:int` suite includes `tests/int/api.int.spec.ts`, which attempts a direct connection
  using `POSTGRES_URL`; only `pnpm test:int:neon` has the target-verification setup described here.
- No `DROP DATABASE` or `CREATE DATABASE` command is part of the procedure. The suite refuses the
  drop flag and disables Payload's automatic create-database fallback. Schema push and test writes
  are still changes, so run them only after the owner approves the exact disposable target.

## Does the harness support a separate Neon Project?

**Yes.** `NEON_TEST_PROJECT_ID` and `NEON_APP_PROJECT_ID` are independent. The verifier looks up the
approved test branch and endpoint in the test project, then looks up the endpoint parsed from
`POSTGRES_URL` in the app project. It does not require the two project IDs to be equal; the synthetic
guard-test success case uses different project IDs.

There are two exact constraints:

1. One `NEON_API_KEY` is used for all metadata calls and must be authorized to read both projects.
   The calls are `branches.get`, `endpoints.listByBranch`, and `endpoints.get`; if either project's
   metadata is inaccessible, preflight fails before a database connection.
2. `POSTGRES_URL` and `NEON_APP_PROJECT_ID` are required so the harness can identify the normal app
   endpoint and prove it maps to a different branch. There is no `NEON_APP_ENDPOINT_ID` variable:
   the endpoint ID is parsed from the hostname in `POSTGRES_URL`. That URL is used only for local
   parsing and read-only endpoint metadata validation in this suite, not as a database target.

The harness does **not** query Neon metadata to establish that a database is empty, and it does not
verify the contents inherited by a branch. The owner must create the isolated project and perform
the read-only empty-database check below. `NEON_TEST_BRANCH_DISPOSABLE=true` is an owner assertion,
not a proof supplied by Neon metadata.

## 1. Provision an isolated, empty test target in Neon

1. In the Neon Console, create a **new project** for this validation. Do not use a branch-create,
   restore, clone, or import action from the application's production or development project.
   Choose the desired region and allow Neon to create the initial project/default branch and its
   database. The initial database must contain no application tables or imported data.
2. From that new project’s settings/details, copy its **Project ID**. Record it as
   `NEON_TEST_PROJECT_ID`. Keep the project name/ID distinguishable from the app project so the
   dashboard selection is obvious.
3. In this new project only, create a named child branch from its own initial/default branch. The
   child branch—not the default branch—is the integration target. Do not copy a branch from another
   project. Confirm in branch details that the target branch is **not default** and **not protected**.
4. Confirm the child branch has an enabled **read-write** endpoint. From the branch/compute endpoint
   details, independently copy its **Endpoint ID** and record it as `NEON_TEST_ENDPOINT_ID`. Do not
   derive this expected ID only from the connection URL. Also copy the child branch’s **Branch ID**
   as `NEON_TEST_BRANCH_ID`.
5. In the Neon SQL Editor, explicitly select the **new test project**, the **child test branch**, and
   the intended database. Check the visible project, branch, and database selections before running
   this read-only query:

   ```sql
   SELECT current_database() AS database_name;

   SELECT schemaname, tablename
   FROM pg_catalog.pg_tables
   WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
   ORDER BY schemaname, tablename;
   ```

   The first result must be the database you intend to test. The second query must return **zero
   rows**. If it returns any user tables, or if the selected project/branch/database is uncertain,
   stop. Do not try to make the database empty by dropping tables; create a fresh Neon project and
   repeat the check. A newly created project plus the explicit query is the isolation evidence that
   there is no inherited application data.

6. In the Console’s connection details, select that same child branch, the verified existing
   database, and a role that can perform the schema push and test writes. Copy the **pooled** Neon
   connection URL as `POSTGRES_TEST_URL`; keep it private. Copy the exact database name shown by the
   Console/query as `NEON_TEST_DATABASE`. The harness checks that the URL’s endpoint ID, normalized
   host, and database path match the independent expected values and Neon metadata. It does not
   create a missing database.
7. Separately obtain `NEON_APP_PROJECT_ID` from the application's project details, and use the
   normal application `POSTGRES_URL` only for the metadata comparison described above. **Do not
   open the app URL in a client, SQL Editor, migration tool, seed command, or test.** Create/obtain
   `NEON_API_KEY` through Neon account API-key settings; it must be authorized to read metadata for
   this app project and the new test project. The key may have broader permissions than these
   read-only calls; treat it as a full secret. If metadata access to either project is not approved,
   stop rather than bypassing the app-endpoint check.

The branch name is only a label. Names such as `test`, a different-looking hostname, a different
database name, or a different endpoint do not substitute for the independent IDs, owner opt-ins,
and successful metadata checks.

## 2. Required variables and exact meanings

Set these in the PowerShell process that will run the test. Values are case-sensitive where noted.
Do not put them in `.env`, `.env.example`, a tracked file, a script file, or a command line.

| Variable                            | Required value / meaning                                                                                                                                                                                     |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `POSTGRES_TEST_URL`                 | Pooled Neon connection URL for the approved child branch and its already-existing database. There is no fallback. The URL’s Neon host and database path must match the copied endpoint ID and database name. |
| `POSTGRES_URL`                      | Normal application Neon URL, required as a comparison identity only. Preflight parses it and checks its endpoint metadata; the live test does not connect to this URL.                                       |
| `NEON_API_KEY`                      | One Neon API key that can read branch/endpoint metadata in both projects. The harness uses read-only SDK calls; API errors are hidden and fail closed.                                                       |
| `NEON_TEST_PROJECT_ID`              | Project ID of the new isolated test project.                                                                                                                                                                 |
| `NEON_APP_PROJECT_ID`               | Project ID that owns the endpoint in `POSTGRES_URL`; it may differ from `NEON_TEST_PROJECT_ID`.                                                                                                              |
| `NEON_TEST_BRANCH_ID`               | Exact `br-…` ID of the child test branch, copied independently from Neon. Neon metadata must say it belongs to the test project and is not default or protected.                                             |
| `NEON_TEST_ENDPOINT_ID`             | Exact `ep-…` ID of the test branch’s enabled read-write endpoint, copied independently from endpoint details. It must match the URL and Neon metadata.                                                       |
| `NEON_TEST_DATABASE`                | Exact, existing database name in the test URL. This is an identity comparison, not evidence that the target is disposable or empty.                                                                          |
| `NEON_TEST_BRANCH_DISPOSABLE`       | Must be the exact lowercase string `true`. Owner approval that this exact child branch may be discarded; it is not independently proven by the API.                                                          |
| `PAYLOAD_TEST_DB_ALLOW_DESTRUCTIVE` | Must be the exact lowercase string `true`. Explicit owner approval for schema push and synthetic test writes on the test branch. It does not authorize a database drop/create.                               |
| `NODE_ENV`                          | Set to `test` for this run; the PowerShell commands below set it. Vitest setup also checks this.                                                                                                             |
| `PAYLOAD_DB_PUSH`                   | Do **not** set it to `true`. The setup rejects a shell-provided `true`, clears the flag, and enables it only after metadata verification. The commands set it to `false` before starting.                    |
| `PAYLOAD_DROP_DATABASE`             | Must not equal `true`; the commands set it to `false`. The harness rejects `true`.                                                                                                                           |

`PAYLOAD_SECRET` is not a required owner value for this run: the setup generates a random process-only
value when absent or too short. `PLAYWRIGHT_TEST` is set by the setup to suppress form-email delivery.
Read-replica variables are cleared before Payload config is imported. `NEON_PROJECT_ID` and
`NEON_BRANCH_ID` are not substitutes for the separate `NEON_TEST_*` values.

## 3. Windows 11 / PowerShell commands

Use a fresh interactive PowerShell session from the repository root. The following commands prompt
for URLs, key, and IDs without echoing them. They set **process-scoped** environment variables only;
they do not write credentials to disk or PowerShell history. The test process must hold URL/key
values in memory while it runs.

### Optional offline harness guard tests

Run these before entering credentials if desired. They use synthetic URLs and fake metadata only;
they make no Neon API or database connection:

```powershell
pnpm exec vitest run --config ./vitest.config.mts tests/int/neon-harness-guards.int.spec.ts
if ($LASTEXITCODE -ne 0) { throw 'Offline Neon harness guard tests failed.' }
```

There is no separate live-preflight command. The live preflight is `tests/integration/neonFailClosedSetup.ts`,
loaded by `vitest.neon.config.mts` before the Neon integration spec. The single command below runs
that preflight and, only if it succeeds, the integration tests.

### Prompt, validate, run, and restore process environment

Run this block only after completing the dashboard steps and empty-database check above. The
PowerShell prompts hide input; the status check prints variable **names only**, never values.

```powershell
$ErrorActionPreference = 'Stop'
$processNames = @(
  'POSTGRES_URL', 'POSTGRES_TEST_URL', 'NEON_API_KEY',
  'NEON_TEST_PROJECT_ID', 'NEON_APP_PROJECT_ID',
  'NEON_TEST_BRANCH_ID', 'NEON_TEST_ENDPOINT_ID', 'NEON_TEST_DATABASE',
  'NEON_TEST_BRANCH_DISPOSABLE', 'PAYLOAD_TEST_DB_ALLOW_DESTRUCTIVE',
  'NODE_ENV', 'PAYLOAD_DB_PUSH', 'PAYLOAD_DROP_DATABASE'
)
$previous = @{}
foreach ($name in $processNames) {
  $previous[$name] = [Environment]::GetEnvironmentVariable(
    $name, [EnvironmentVariableTarget]::Process
  )
}

function Set-ProcessValueFromHiddenPrompt {
  param([Parameter(Mandatory)][string]$Name)
  $secure = Read-Host "Enter $Name" -AsSecureString
  if ($secure.Length -eq 0) {
    $secure.Dispose()
    throw "A value for $Name is required. No value was displayed."
  }
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try {
    $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    [Environment]::SetEnvironmentVariable(
      $Name, $plain, [EnvironmentVariableTarget]::Process
    )
    $plain = $null
  }
  finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
    $secure.Dispose()
  }
}

try {
  if ($previous['PAYLOAD_DB_PUSH'] -ceq 'true') {
    throw 'PAYLOAD_DB_PUSH was already true. Remove that manual/profile setting, start a new session, and do not clear it inside this block.'
  }
  if ($previous['PAYLOAD_DROP_DATABASE'] -ceq 'true') {
    throw 'PAYLOAD_DROP_DATABASE was already true. Remove that setting and start a new session.'
  }

  foreach ($name in @(
    'POSTGRES_URL', 'POSTGRES_TEST_URL', 'NEON_API_KEY',
    'NEON_TEST_PROJECT_ID', 'NEON_APP_PROJECT_ID',
    'NEON_TEST_BRANCH_ID', 'NEON_TEST_ENDPOINT_ID', 'NEON_TEST_DATABASE'
  )) {
    Set-ProcessValueFromHiddenPrompt -Name $name
  }

  $approval = Read-Host 'After verifying the empty child branch and IDs in Neon, type APPROVE-TEST-BRANCH to authorize schema push and synthetic writes'
  if ($approval -cne 'APPROVE-TEST-BRANCH') {
    throw 'Explicit disposable-branch and schema-change approval was not confirmed.'
  }

  [Environment]::SetEnvironmentVariable(
    'NEON_TEST_BRANCH_DISPOSABLE', 'true', [EnvironmentVariableTarget]::Process
  )
  [Environment]::SetEnvironmentVariable(
    'PAYLOAD_TEST_DB_ALLOW_DESTRUCTIVE', 'true', [EnvironmentVariableTarget]::Process
  )
  [Environment]::SetEnvironmentVariable(
    'NODE_ENV', 'test', [EnvironmentVariableTarget]::Process
  )
  [Environment]::SetEnvironmentVariable(
    'PAYLOAD_DB_PUSH', 'false', [EnvironmentVariableTarget]::Process
  )
  [Environment]::SetEnvironmentVariable(
    'PAYLOAD_DROP_DATABASE', 'false', [EnvironmentVariableTarget]::Process
  )

  $required = @(
    'POSTGRES_URL', 'POSTGRES_TEST_URL', 'NEON_API_KEY',
    'NEON_TEST_PROJECT_ID', 'NEON_APP_PROJECT_ID',
    'NEON_TEST_BRANCH_ID', 'NEON_TEST_ENDPOINT_ID', 'NEON_TEST_DATABASE',
    'NEON_TEST_BRANCH_DISPOSABLE', 'PAYLOAD_TEST_DB_ALLOW_DESTRUCTIVE'
  )
  $missing = @($required | Where-Object {
    [string]::IsNullOrWhiteSpace(
      [Environment]::GetEnvironmentVariable($_, [EnvironmentVariableTarget]::Process)
    )
  })
  if ($missing.Count -gt 0) {
    throw "Required process variables are missing: $($missing -join ', ')"
  }
  if ($env:NEON_TEST_BRANCH_DISPOSABLE -cne 'true') {
    throw 'NEON_TEST_BRANCH_DISPOSABLE must be the exact lowercase string true.'
  }
  if ($env:PAYLOAD_TEST_DB_ALLOW_DESTRUCTIVE -cne 'true') {
    throw 'PAYLOAD_TEST_DB_ALLOW_DESTRUCTIVE must be the exact lowercase string true.'
  }
  if ($env:PAYLOAD_DB_PUSH -ceq 'true' -or $env:PAYLOAD_DROP_DATABASE -ceq 'true') {
    throw 'A prohibited database flag is true; stop without starting Vitest.'
  }
  Write-Host 'Required variable names are present; values were not displayed.'

  pnpm test:int:neon
  $suiteExitCode = $LASTEXITCODE
  if ($suiteExitCode -ne 0) {
    throw "The Neon command exited with code $suiteExitCode. Stop; do not retry until the reported identity or connection issue is understood."
  }
  Write-Host 'The command exited successfully. Confirm the Vitest summary shows all 3 tests passed; an early exit at a schema warning is not a passing run.'
}
finally {
  foreach ($name in $processNames) {
    [Environment]::SetEnvironmentVariable(
      $name, $previous[$name], [EnvironmentVariableTarget]::Process
    )
  }
  $previous.Clear()
}
```

Do not redirect the command output to a file. Do not paste URLs, keys, passwords, or connection
errors into tickets or chat. If an operator decides to persist configuration for other work, use a
local secret manager; this runbook deliberately does not write a `.env` file.

## 4. Expected results and stop conditions

### Expected successful run

On the new project's empty child-branch database, the adapter should connect to the verified test
endpoint, run Payload's schema push, initialize Payload, and execute these three tests:

1. Real Local API query through the installed Vercel/Neon adapter and database.
2. Anonymous GraphQL request denied with HTTP `401` and `Cache-Control: no-store`.
3. Anonymous REST form submission returns `201`, persists the synthetic record, and an anonymous
   read of that submission returns `403`.

A successful result is a Vitest summary showing **3 passed, 0 skipped**. The schema push should
create the Payload schema on the empty database. If the process exits without that test summary—even
if PowerShell reports exit code zero—do **not** call it a pass. Payload's installed schema-push code
can exit early when it declines a warning prompt.

### Stop immediately if any of these occur

- Any required variable is missing, malformed, or does not match the independently copied IDs.
- Neon metadata cannot be fetched, the API key cannot read either project, or project/branch/endpoint
  IDs or endpoint host do not match.
- The test branch is default or protected, the endpoint is disabled or not read-write, the test and
  app endpoint/branch identities are not distinct, or the database selected in the Console is not
  the intended empty test database.
- The empty-database query returns rows, or the parent/lineage of the child branch is uncertain.
- Any schema-push warning indicates possible data loss, asks to drop/rename an object, or otherwise
  differs from the expected create-only empty-schema push. Decline/press Enter for the default “no”
  or cancel. Do not accept a warning to make the suite continue.
- After metadata succeeds, the database connection fails, tests fail, or the output does not show all
  three tests passing. The harness disables database creation, so a missing database is an error; do
  not create it by running SQL as a workaround.

A failure during local validation or Neon metadata lookup occurs before Payload's database
connection. Once metadata succeeds, the only intended database URL is the verified
`POSTGRES_TEST_URL`. On any unexpected target indication, stop the process and do not retry with
weaker checks or manually set `PAYLOAD_DB_PUSH=true`.

## 5. Cleanup without `DROP DATABASE`

The suite intentionally leaves data behind. It creates a synthetic form and anonymous form
submission; Payload startup may also initialize default roles/forms and the schema-push migration
marker. The test does not delete those records or drop the database. `payload.db.destroy()` in the
spec is not a data cleanup operation.

After recording the test result:

1. In Neon Console, open the **dedicated test project**, verify its project ID, then select the
   exact **non-default child test branch** by its recorded branch ID.
2. Delete **that test branch only** using the Console's branch-delete action. This discards the
   branch-local schema and synthetic rows without connecting to, querying, or changing the
   application's production/development database. Do not select the test project's default branch
   or any branch in the app project.
3. If the entire Neon project was created solely for this test and is no longer needed, the owner may
   separately delete that isolated project in the Console after rechecking its project ID. This is
   optional; deleting the test child branch is sufficient. Do not issue SQL `DROP DATABASE`.
4. The PowerShell block restores the process environment variables that existed before the run.
   Close the shell after the run as an additional precaution. Do not retain or print the hidden
   values.

If branch deletion is unavailable or its identity is uncertain, stop and ask the Neon project owner;
do not clean up with database-drop commands or touch an application project.
