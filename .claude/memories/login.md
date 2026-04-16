# QA Login Guide

## How to authenticate quickly in headless browser sessions

All apps redirect unauthenticated users to `http://localhost:3000/auth/login`.

### Magic link login (single bash block — must keep session alive)

```bash
B=~/.claude/skills/gstack/browse/dist/browse

$B goto http://localhost:3000/auth/login
$B snapshot -i > /dev/null 2>&1          # hydrate refs
$B fill @e3 "canh.ta@seta-international.vn"
$B click @e4                              # Send magic link
sleep 2                                   # wait for redirect
# Now on http://localhost:3001/ (or whichever zone)
```

> **IMPORTANT**: All `$B` commands must be in the **same bash block** to share the browser session (and thus the auth cookie). Each new Bash tool call starts a fresh browse process.

### Port map

| App              | Port |
| ---------------- | ---- |
| web-shell (auth) | 3000 |
| web-people       | 3001 |
| web-admin        | 3010 |

### After login — refresh refs before clicking

Always run `$B snapshot -i > /dev/null 2>&1` after navigating to a new page before clicking buttons. Refs go stale on navigation.

### Typical navbar refs (web-people after login)

```
@e1  Toggle Sidebar
@e2  Open app launcher (⌘K)
@e3  Search or ask an agent
@e4  Open agent panel
@e5  Notifications
@e6  Switch to dark mode
@e7  User menu
@e8+ Page-level content buttons (Filters, List view, etc.)
```

> If the sidebar is expanded, sidebar nav links may shift @e numbers — always re-snapshot after sidebar state changes.
