# Building Codex Account Deck

The project does not require GitHub-hosted runners. GitHub stores public source and downloadable releases; Instabox executes the release build.

The Windows GitHub workflow is manual-only, so pushes and pull requests do not request paid GitHub runners. Trigger it only if hosted Windows minutes become available again.

## Local checks

On Windows, `npm run build:credentials` builds CredentialHost.exe from source and `npm test` includes the DPAPI and PowerShell installer checks. On Linux, the same suite explicitly skips those Windows-only cases. Skipped tests are not counted as Windows passes.

## Remote build

Install and authenticate the Instabox CLI, commit/push the intended source, and run:

```powershell
npm run build:instabox -- -Box YOUR_EXISTING_BOX
```

The command uses a clean public clone pinned to the full commit SHA. Build scripts execute with a sanitized environment and disabled global Git configuration. Existing application checkouts are not used or altered. All working files live in a fresh account-deck-build directory. Supplying an existing box leaves that box intact; the wrapper only deletes a box it creates itself.

The ZIP contains tracked source, installer scripts, and docs. It excludes local profiles, account vaults, auth.json, chat databases, node_modules, credentials, and application binaries. The build manifest records the exact commit and artifact checksum. Git archive makes the source ZIP reproducible for the same commit and Git archive behavior.

Remote artifacts are downloaded to dist/. Validate SHA256SUMS.txt before uploading them to a GitHub release. The Windows installer compiles the DPAPI helper locally using the included C# source; it does not download an opaque executable from the builder.

## Scope

Instabox Linux validates portable code and packages the release. It cannot validate a real Windows Codex session or Windows DPAPI behavior. Cloudflare Workers Builds is also Linux-based and would have the same limitation. Official references: [Cloudflare build image](https://developers.cloudflare.com/workers/ci-cd/builds/build-image/) and [Microsoft ProtectedData](https://learn.microsoft.com/en-us/dotnet/api/system.security.cryptography.protecteddata).

Real two-account desktop evidence and Windows installer results are documented separately in verification.md. The build does not change Codex update settings or weaken the compatibility guard.
