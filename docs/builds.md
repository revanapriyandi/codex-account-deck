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

The setup EXE contains add-on source, installer scripts, licenses, and a private Windows x64 Node.js runtime. Node.js is downloaded from its official distribution at the pinned version/checksum in build/runtime.json; a mismatch stops the build. The installer excludes local profiles, account vaults, auth.json, chat databases, node_modules, credentials, and official Codex binaries. The build manifest records the exact source commit, compiler version, runtime archive checksum, and installer checksum.

Remote artifacts are downloaded to dist/. The public release contains only the setup EXE; its checksum and build provenance belong in the release notes. The Windows installer compiles the DPAPI helper locally using the included C# source. NSIS and its common files are downloaded through signed Debian package indexes and unpacked into an owned temporary directory when makensis is absent; no system package installation is required.

The EXE is unsigned. No signing certificate is configured. Windows publisher/reputation dialogs may appear; the installer does not suppress them or change security settings.

## Scope

Instabox Linux validates portable code and packages the release. It cannot validate a real Windows Codex session or Windows DPAPI behavior. Cloudflare Workers Builds is also Linux-based and would have the same limitation. Official references: [Cloudflare build image](https://developers.cloudflare.com/workers/ci-cd/builds/build-image/) and [Microsoft ProtectedData](https://learn.microsoft.com/en-us/dotnet/api/system.security.cryptography.protecteddata).

Real two-account desktop evidence and Windows installer results are documented separately in verification.md. The build does not change Codex update settings or weaken the compatibility guard.

Test the actual setup EXE on Windows with:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify-installer.ps1 -Installer .\dist\codex-account-deck-v0.2.0-beta.3-setup.exe -LaunchSmoke
```

This uses a new temporary directory, disables global Node discovery in the test process, and exercises install, isolated app launch/close, reinstall, active-helper refusal, unowned-directory refusal, and EXE uninstall with retained data. `/TESTMODE` suppresses shortcuts and uninstall registration for this isolated verification. Reports stay in the temporary directory; never publish a runtime profile.
