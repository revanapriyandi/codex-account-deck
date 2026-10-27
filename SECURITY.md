# Security

Report suspected vulnerabilities privately through GitHub private vulnerability reporting when enabled. Do not post credentials, account identifiers, profile archives, or raw application logs in issues.

## Credential boundary

The Node.js helper reads the existing local Codex authentication file and stores account snapshots using DPAPI `CurrentUser`. Only metadata is returned to the UI. Login uses the installed official CLI in a temporary, separate Codex home. The temporary authentication file is removed after snapshotting; the rest of that login directory may contain non-credential runtime files.

DPAPI protects data at rest across Windows users. It does not protect against malicious software running as the same user, administrators, or an already-compromised desktop. JavaScript and native process buffers cannot provide a guarantee that every copied secret is zeroed from memory.

## Local debugging boundary

The add-on launches the official app with a random **loopback-only CDP port**. CDP can control the application, including its authenticated state. Treat local access to that endpoint as privileged. It is not a remotely exposed service and has no network API supplied by this project. Other software running locally may still discover and access it. Do not expose or forward this port.

Renderer bindings are checked against the exact main application origin/path and accept only a bounded set of add-on operations. The helper does not accept arbitrary shell commands from the UI. Compatibility checks are a version guard, not a security sandbox.

## Switching boundary

Loaded local turns are checked before changing credentials. The helper serializes its own switches and disables ordinary UI actions during the transition. It cannot guarantee coordination with independent CLI processes, external automation, other signed-in app instances, or remote/cloud work. Finish those operations before switching. The installer does not change credential-store preferences to force compatibility.

If recovery cannot be verified, the add-on blocks further switching and asks you to close/reopen Codex. A recovery journal stores account snapshot identifiers, never raw tokens. Keep the encrypted vault until recovery succeeds.

## Publication boundary

No OpenAI executable, ASAR contents, extracted source, runtime database, saved account, or profile is part of this repository or release archive. The MIT license only covers this project's original implementation.
