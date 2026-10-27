# Contributing

Use Windows and Node.js 22 or newer. Build the DPAPI helper with `npm run build:credentials`, then run `npm test`.

Keep test logins in a sandbox outside the checkout. Never commit runtime profiles, account metadata, credentials, screenshots containing real names/emails, or extracted Codex application code.

A compatibility update needs the installed package version and relevant JavaScript fingerprints plus a real two-account test. Verify backend identity, actual model requests on both accounts, no main-document navigation, refusal during active local work, project/chat continuity, reduced motion, recovery, install/uninstall, and unchanged official application files. Clearly identify what could not be tested.

Keep scope focused. Preserve native account-name menu behavior, keyboard access, and the original-profile layout. Prefer built-in Node.js, Windows APIs, and CSS over extra runtime dependencies.
