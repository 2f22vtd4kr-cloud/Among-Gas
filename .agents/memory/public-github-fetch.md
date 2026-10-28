---
name: Public GitHub fetch fallback
description: Fetch explicitly public GitHub repositories when the connected GitHub route is unavailable.
---

When the GitHub integration is disconnected, the machine Git configuration may rewrite `https://github.com/` URLs to Replit's authenticated proxy. For a repository confirmed public, an anonymous clone can be made by disabling the injected Git configuration for that command with `GIT_CONFIG_NOSYSTEM=1 GIT_CONFIG_GLOBAL=/dev/null`.

**Why:** the authenticated proxy rejected a public repository request while the public GitHub endpoint remained accessible without credentials.

**How to apply:** use this only for repositories confirmed public and only as a fetch/clone fallback. Do not use it for private repositories or to bypass repository permissions; ask the user to reconnect GitHub when authenticated access is required.
