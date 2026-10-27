# Verification

Validation is recorded against the exact supported Windows package. A passed unit suite is not a substitute for an authenticated desktop test.

## Automated checks

- DPAPI round trip and no persisted plaintext test secret.
- Distinct account IDs even when display emails match.
- Path traversal rejection and original-profile layout protection.
- Refusal during active local work without credential mutation.
- Current backend/file identity consistency before a switch.
- Rollback on mismatch and retained gate when recovery fails.
- Startup recovery from an interrupted transaction journal.
- Reconnection timeout larger than the renderer RPC timeout.
- Unknown app version and bridge fingerprint rejection.

On 27 October 2026, all 20 automated tests passed locally on Windows, including install/reinstall/uninstall and a malicious manifest-path rejection. The [sanitized live report](validation-2026-10-27.json) records a real two-account desktop run: actual model replies on A and B, successful A → B → A with automatic list closure, no main-frame navigation, preserved test chat and projects, active-work refusal, and reduced-motion behavior. Rollback/recovery fault paths were tested with simulated backend failures, not induced network failures against real credentials.

That live run used an isolated profile. It does not establish that the installed primary profile has already been activated or tested after a future official update. Presentation frame timing was not measured. In that run, end-to-end switch verification took about 10 and 16 seconds; backend startup and machine load affect latency.

The additional [fresh-start UI report](cold-start-ui-validation-2026-10-27.json) passed both switches, automatic closure, project continuity, reduced motion, and the same main document after reopening the app. It did not send new model requests.

The initial [GitHub Actions run](https://github.com/revanapriyandi/codex-account-deck/actions/runs/40532357305) did not start any test steps because the repository account was not permitted to start the runner. No hosted CI pass is claimed; the 20-test result above was measured locally. Version 0.2 adds the Instabox build path and renames the product to Codex Account Deck while retaining its credential and installation compatibility identifiers.

For version 0.2, the renamed installer and current code passed all 20 tests on Windows. The first Instabox Linux build of commit `af651159d750e42cf0119e726abd78633764af44` passed 17 portable tests with 3 Windows-only tests explicitly skipped, then produced the ZIP and its SHA-256 manifest. The installed-name migration was also checked: both encrypted account files had unchanged hashes, the new Codex Account Deck shortcut existed, and the previous add-on shortcut was removed. Final release artifacts include the exact remote source commit in build-report.json. GitHub runner execution is now manual-only.

## Live desktop checklist

Use a sandbox and two accounts that you are authorized to use. Never publish auth files or account identities.

1. Save A, add B through the official interactive login, and verify the backend identity on each transition.
2. Run an ordinary model request on A and B. Verify completion, not only a changed UI label.
3. Track the main frame loader and a page-local marker through A → B → A. Neither may reset.
4. Create a test chat and verify it remains readable after both switches. Verify project registrations remain unchanged.
5. Attempt switching during a running local turn. The attempt must be refused before auth mutation.
6. Test account-name hover/click/keyboard entry, Escape, reduced motion, success auto-close, and an error that remains visible.
7. Test install → reinstall → launch → close → relaunch → uninstall in a temporary installation. Compare original app hashes before/after.

Run the real-account desktop test only after saving two logins in the sandbox:

```powershell
node .\scripts\verify-desktop.cjs "$env:LOCALAPPDATA\CodexAccountSwitcher-Sandbox"
```

It sends short normal model requests and a counting request for the active-work guard. Add `--ui-only` to test account switching and reduced motion without model requests. Reports are written outside the repository, inside the sandbox directory.

Do not describe future unknown versions as supported. Do not report a fixed frame rate without measuring presentation timing.
