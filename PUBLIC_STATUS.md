# Town systems status: Clerk Hub and the website block

The same systems show up in two places:

| Where | Who sees it | What it shows | Where its data comes from |
|---|---|---|---|
| **Clerk Hub** (claude.ai, private) | Clerk | Every check, with details and Run buttons | The viewer's Microsoft 365 and Make connectors, plus the reports in the System Status SharePoint site (`ClerkHubStatus` folder) |
| **Website status block** (winchesterwi.com, public) | Anyone | One light and a short note per system | `https://records.winchesterwi.com/public/status.json` |

`public/status.json` is written by `public_status.py`, which `system_health.py` runs after every
portal sync (and on its hourly backup timer). It is committed only when a light or note changes,
or about once an hour otherwise, so the block can tell when the information is old (after 3 hours
it shows "Can't confirm").

The block's code is `public/status-block.html`. It goes in a WordPress **Custom HTML** block.

## Current systems

| System | Hub card | Public id | Built in |
|---|---|---|---|
| Microsoft 365 | Microsoft 365 | `microsoft` | `public_status.microsoft()` |
| Records portal sync | SharePoint → portal sync | `portal` | `public_status.portal_sync()` |
| Window sign(s) | Window sign | `sign-<name>` (one per sign) | `public_status.window_sign()` |

## Adding a system: do both, every time

1. **Clerk Hub:** add the system's card to the hub's status board (`renderStatus()` in the hub page),
   with its checks and red/yellow/green rules.
2. **Public file:** add a function to `public_status.py` that returns
   `{"id", "name", "level", "note"}` using the **same rules** as the hub, and call it from
   `build_public_status()`. If its data isn't in the health report yet, add it to
   `system_health.py` first.
3. **Keep it public-safe:** the note is a few plain words. No account names, error messages,
   addresses, network or device readings.
4. **Website block:** nothing to change. It draws whatever systems are in the file.
   Only re-paste `public/status-block.html` into WordPress if the block's own code changed.
5. Add the system to the table above.

If a system can only be added to one side (for example, its data can't be published), note that
in the table and tell the clerk which side is missing it.

Changing a red/yellow/green rule works the same way: change it in the hub and in `public_status.py`.
