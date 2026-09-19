# Security note: retired Neo4j credential (open item)

**Status: the frontend no longer holds or uses any database credential. One action remains open.**

Earlier revisions of this file, and of the now-deleted `NEO4J_SETUP.md`, contained a
Neo4j/Aura connection credential and endpoint in plain text. Both have been removed from the
working tree, but **git history still contains them**. Removing a file does not revoke a
credential.

## Open action — for someone with authority over that database account

- Confirm the Aura instance has been deleted, or rotate / revoke the credential.
- Until someone confirms that, treat the credential as exposed. Its liveness has not been tested,
  and must not be tested by using it.

## What changed in the frontend

- The graph is served by the backend (Amazon Neptune). The frontend connects to no graph database
  directly — neither Neo4j nor Neptune — and reads graph data only through the backend API.
- The two proxy routes that used to query Neo4j directly
  (`app/api/proxy/identities/data-access/[name]`, `app/api/proxy/orphan-services/[systemName]`)
  now use backend data only. Table-level data access, which only the direct query supplied, is
  reported as unavailable rather than as empty.
- No `NEO4J_*` or `NEXT_PUBLIC_NEO4J_*` variable is read anywhere. Do not set one, and never give a
  secret a `NEXT_PUBLIC_` name: those values are shipped to the browser.
- `__tests__/neptune-only-routes.test.ts` fails the build if direct-database access returns.
