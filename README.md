# Codex Account Deck

A removable local account switcher for the **Windows Codex desktop app**. Open the profile menu, hover over or select your account name, then choose a saved ChatGPT account. The account list closes after backend identity verification succeeds.

**Experimental beta.** This is an independent community add-on, not an official OpenAI plugin. It uses internal desktop interfaces that can change. The official application is not redistributed or patched.

## What it does

- Adds the account list to the existing account-name row. No extra profile-menu item.
- Switches accounts by reconnecting the local backend without reloading the main desktop document.
- Uses native browser focus and the existing profile dropdown, keyboard navigation, a short hover delay, and reduced-motion support.
- Saves credential snapshots encrypted with Windows DPAPI for the current Windows user. Tokens stay in the local helper, not the renderer or account list.
- Refuses to switch when loaded local work is active, verifies the backend account, and attempts rollback on failure. A local journal supports recovery after helper interruption.
- Uses the original desktop and Codex home profiles in installed mode, preserving local project registrations and chat history. Sandbox mode deliberately has separate history.
- Leaves official app files, signatures, integrity controls, and updater configuration unchanged.

Backend reconnection takes time. The UI remains responsive and displays progress; instant switching and a fixed frame rate are not promised.

## Requirements and compatibility

- Windows, the official `OpenAI.Codex` MSIX package, Node.js 22 or newer, and Windows PowerShell/.NET Framework.
- ChatGPT login stored in a local Codex `auth.json`. Keychain-only credentials and API-key switching are not supported.
- Initially allowlisted package: **26.1021.3705.0**, desktop **26.1021.31345**. Compatibility also checks packaged bridge fingerprints.

An unknown app version disables injection and opens the official app unchanged. This preserves access to Codex after an update; the add-on needs another compatibility review before it can operate on that version. Future updates cannot be guaranteed compatible in advance.

## Install once

Download the release ZIP, extract it, and double-click **Install.cmd**. Alternatively, clone this repository and run from PowerShell:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\Install.ps1
```

The installer builds the small DPAPI helper from the included C# source, installs into `%LOCALAPPDATA%\CodexAccountSwitcher`, and creates **Codex Account Deck** shortcuts on the desktop and Start menu. No administrator rights are required.

Formerly Codex Account Switcher. The existing installation directory, manifest product ID, and DPAPI entropy remain unchanged for compatibility. Updating replaces this add-on's old shortcuts without discarding saved accounts. Download releases from [revanapriyandi/codex-account-deck](https://github.com/revanapriyandi/codex-account-deck/releases).

Close Codex normally, then use that shortcut. The helper does not stop a running Codex window. Continue using this shortcut for account switching; opening Codex through its original shortcut does not load the add-on. The original shortcut remains available.

If automatic profile discovery does not match your installation, supply existing paths:

```powershell
.\Install.ps1 -CodexHome 'C:\path\to\.codex' -BrowserProfile 'C:\path\to\existing\browser-profile'
```

The installer does not copy your chats into another account. Local Codex history remains in the same local profile. Cloud projects and cloud history remain subject to the selected account's access.

## Add and switch accounts

1. Open the profile menu and hover over or select the existing account name.
2. Select **Simpan akun ini** to save the current login locally.
3. Select **Tambah akun**, then complete the official login in your browser. Adding an account does not switch the current account.
4. Select another saved account. Wait for verification; the list closes automatically after success. A failed switch keeps the error visible.

Only use accounts you control or are authorized to use. Account labels and plan metadata are stored locally in readable form; credential snapshots are DPAPI encrypted.

## Uninstall

Close the add-on Codex window normally, then run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "$env:LOCALAPPDATA\CodexAccountSwitcher\app\Uninstall.ps1"
```

This removes recorded helper files and its shortcuts. It does not modify the original Codex profile or sign you out of the current account. Encrypted saved accounts are retained by default. Add `-RemoveSavedAccounts` to remove those snapshots as well; deletion does not revoke server sessions.

## Develop and test

```powershell
npm run build:credentials
npm test
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\Start-Sandbox.ps1
```

The sandbox uses `%LOCALAPPDATA%\CodexAccountSwitcher-Sandbox`, has separate projects/chats, and never uses the primary `CODEX_HOME`. Complete interactive logins there to test real account switching. Do not copy credentials or runtime profiles into this checkout.

See [architecture and limitations](docs/architecture.md), [verification](docs/verification.md), and [security](SECURITY.md). Runtime reports are local; public reports must exclude account identities, credentials, chat content, and internal project names.

## Build with Instabox

GitHub hosts the source and release downloads. Release ZIP creation and portable tests run on Instabox, without GitHub Actions minutes:

```powershell
npm run build:instabox -- -Box YOUR_EXISTING_BOX
```

Run from a clean committed checkout that has been pushed to GitHub. The script uploads only the builder script, checks out the exact public commit in a fresh temporary directory, runs the portable tests, creates a source-only ZIP, and downloads the artifacts into `dist/`. It does not upload a Codex profile or credentials. Omitting `-Box` creates a temporary box with no Vault/Secrets injection and deletes that box afterwards; account quota may require using an existing box.

Artifacts include the ZIP, SHA256SUMS.txt, build-report.json with the exact commit/platform, and portable-tests.txt. The Windows DPAPI helper is compiled locally during installation. Linux builds skip DPAPI and Windows installer tests; run `npm run build:credentials` and `npm test` on Windows for those checks. See [build details](docs/builds.md).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Version updates require runtime validation on the actual official package. Do not bypass the compatibility guard, modify app integrity controls, or commit extracted application code.

MIT license applies to this repository's original code. Codex and OpenAI names identify the interoperated product; ownership of those products remains with their respective owners.
