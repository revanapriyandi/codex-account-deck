# Architecture

`Launch.ps1` finds the currently installed official MSIX package and launches a hidden Node.js helper inside that package's identity. The helper checks compatibility before opening the official executable with a local debugging endpoint. It never changes the application files or update settings.

The helper attaches only to `app://-/index.html` main app pages. It adds a small UI extension to the existing account-name row. The renderer sees account metadata and operation results; the helper owns DPAPI and filesystem operations.

The transition is:

1. Decrypt the selected local snapshot.
2. Disable ordinary desktop UI interaction and check loaded local turns.
3. Match the current auth file against the active backend and snapshot refreshed credentials.
4. Check local turns again and persist a recovery journal containing snapshot IDs.
5. Atomically replace the local auth file and reconnect the local app-server.
6. Wait for the backend identity to match the selected account, then check the auth file again.
7. Snapshot any newly refreshed credentials, remove the journal, re-enable interaction, and close the account list.

On failure, the previous encrypted snapshot is restored and its backend identity verified. A failed recovery retains the journal and disables additional switches. Startup attempts recovery before reporting the add-on ready.

The main desktop document remains loaded; the local backend process may restart. Internal account-dependent app services may rebuild as a normal consequence of account changes. Cloud authorization remains account-specific.

## Profiles and history

Installed mode points to the existing `CODEX_HOME` and lets the official runtime choose its original browser profile. The discovered browser profile path is used only to locate its CDP endpoint. No empty replacement chat database is created.

Sandbox mode explicitly overrides both the Codex home and browser profile. It is useful for tests but intentionally does not show primary-profile chats. It is not a migration or cloud synchronization facility.

## Updates and lifecycle

The launcher rediscovers the package installation path each time. Unknown versions are not injected. The official updater retains its package identity. An update-triggered restart may reopen the official app without the helper; after compatibility is reviewed, open it through the add-on shortcut again.

The installer creates its own shortcut instead of replacing the official one. Installation does not automatically interrupt the current desktop. The uninstaller refuses while its helper is running and removes only its manifest-owned files and shortcuts. Saved account data is retained unless explicitly requested for removal.

## Limits

There is no stable supported desktop menu-extension API used here. This is an experimental integration. Cross-process credential refresh races and independently started automation cannot be made globally atomic by a renderer add-on. API-key switching and keychain-only authentication are outside this version's scope.
