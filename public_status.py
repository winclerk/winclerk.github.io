"""
public_status.py - the public version of the Clerk Hub's status lights.

system_health.py calls build_public_status() after each health check and
commits the result to public/status.json. Anyone can read that file at
https://records.winchesterwi.com/public/status.json, and the status block on
winchesterwi.com shows it.

It keeps only a plain light and a short note for each system. Nothing private
goes in: no account names, error messages, Wi-Fi or temperature readings,
or Make details.

The levels follow the Clerk Hub's own rules (its evalMicrosoft, evalSync and
evalSign), so the public lights and the hub's lights agree. If a rule changes
in the hub, change it here too.

ADDING A SYSTEM: add a function that returns {"id","name","level","note"},
call it from build_public_status(), and add the same system to the Clerk Hub's
status board. The website block draws whatever systems are in the file, so it
needs no change. The checklist is in PUBLIC_STATUS.md.
"""

from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

CENTRAL = ZoneInfo("America/Chicago")
RANK = {"red": 3, "yellow": 2, "green": 1, "gray": 0}
OK_STATUSES = {"serviceOperational", "serviceRestored", "resolved", "resolvedExternal", "falsePositive",
               "postIncidentReviewPublished", "mitigated", "mitigatedExternal"}
# Only these fields reach the public file.
PUBLIC_FIELDS = ("id", "name", "level", "note")


def _parse(ts):
    try:
        return datetime.fromisoformat(str(ts).replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return None


def _clock(ts, now):
    d = _parse(ts)
    if not d:
        return "an unknown time"
    d, n = d.astimezone(CENTRAL), now.astimezone(CENTRAL)
    t = d.strftime("%I:%M %p").lstrip("0")
    return t if d.date() == n.date() else d.strftime("%b %d, ").replace(" 0", " ") + t


def _worst(checks):
    """The most serious level among checks that could be made (gray = couldn't check)."""
    real = [c for c in checks if c["level"] != "gray"]
    if not real:
        return {"level": "gray", "note": checks[0]["note"] if checks else "Not checked"}
    return max(real, key=lambda c: RANK[c["level"]])


def sync_allowance(now):
    """Same as the hub: syncs run at :45 from 6:45 AM to 11:45 PM Central."""
    c = now.astimezone(CENTRAL)
    t = c.hour + c.minute / 60
    if t >= 7.5 or t < 0.75:
        return timedelta(hours=2)
    return timedelta(hours=t + (24 - 23.83) + 2)


# ---------------------------------------------------------------- Microsoft 365
def _service_verdict(sv, issues):
    """Microsoft calls a service 'degraded' even for minor advisories; only incidents count."""
    if sv.get("status") in OK_STATUSES:
        return "green"
    mine = [i for i in issues if i.get("service") == sv.get("name")]
    incidents = [i for i in mine if str(i.get("classification", "")).lower() == "incident"]
    if mine and not incidents:
        return "green"                  # advisories only
    return "red" if sv.get("status") == "serviceInterruption" else "yellow"


def microsoft(report):
    checks = []
    gt, sp = report.get("graph_token") or {}, report.get("sharepoint_read") or {}
    if not gt.get("ok"):
        checks.append({"level": "red", "note": "The records portal can't sign in to Microsoft"})
    elif sp and not sp.get("ok"):
        checks.append({"level": "yellow", "note": "The records portal can't read SharePoint"})
    else:
        checks.append({"level": "green", "note": "Running normally"})
    mh = report.get("m365_health") or {}
    if mh.get("state") == "ok" and mh.get("services"):
        issues = mh.get("issues") or []
        bad = [(sv.get("name", "A service"), _service_verdict(sv, issues)) for sv in mh["services"]]
        bad = [(n, lv) for n, lv in bad if lv != "green"]
        if bad:
            lv = "red" if any(l == "red" for _, l in bad) else "yellow"
            word = "outage" if lv == "red" else "having problems"
            checks.append({"level": lv, "note": ", ".join(n for n, _ in bad) + " " + word})
        else:
            checks.append({"level": "green", "note": "Email, SharePoint, OneDrive and Teams running normally"})
    elif mh.get("state") == "error":
        checks.append({"level": "yellow", "note": "Couldn't read Microsoft's service status"})
    w = _worst(checks)
    return {"id": "microsoft", "name": "Microsoft 365", "level": w["level"], "note": w["note"]}


# ---------------------------------------------------------------- portal sync
def portal_sync(report, now):
    s = report.get("sync") or {}
    name = {"id": "portal", "name": "Records portal sync"}
    if not s.get("ok"):
        return dict(name, level="yellow", note="Couldn't check the sync history")
    runs = sorted(s.get("runs") or [], key=lambda r: r.get("started") or r.get("updated") or "", reverse=True)
    done = [r for r in runs if r.get("status") == "completed" and r.get("conclusion") not in ("cancelled", "skipped")]
    ok = next((r for r in done if r.get("conclusion") == "success"), None)
    fails = 0
    for r in done:
        if r.get("conclusion") == "success":
            break
        fails += 1
    if not ok:
        return dict(name, level="red", note="Recent syncs haven't succeeded")
    last = ok.get("updated") or ok.get("started")
    age = now - (_parse(last) or now)
    allow = sync_allowance(now)
    if fails >= 2:
        return dict(name, level="red", note=f"Out of sync since {_clock(last, now)}")
    if age > allow + timedelta(hours=2):
        return dict(name, level="red", note=f"Out of sync since {_clock(last, now)}")
    if fails == 1:
        return dict(name, level="yellow", note="The latest sync failed; the next one usually fixes it")
    if age > allow:
        return dict(name, level="yellow", note=f"Running late (last synced {_clock(last, now)})")
    return dict(name, level="green", note=f"Last synced {_clock(last, now)}")


# ---------------------------------------------------------------- window signs
def window_sign(sign, label, many, now):
    name = {"id": "sign-" + label, "name": f"Window sign ({label})" if many else "Window sign"}
    checked = _parse(sign.get("checked"))
    age = now - checked if checked else timedelta(days=999)
    if age > timedelta(minutes=25):
        return dict(name, level="red", note=f"Not heard from since {_clock(sign.get('checked'), now)}")
    checks = [{"level": "green" if age <= timedelta(minutes=12) else "yellow", "note": "Checking in late"}]
    if sign.get("paused"):
        checks.append({"level": "yellow", "note": "Stopped"})
    elif sign.get("session_running") is False or sign.get("browser_running") is False:
        checks.append({"level": "red", "note": "The sign page isn't showing"})
    elif sign.get("screen_scheduled_off"):
        checks.append({"level": "green", "note": "Screen off for the night"})
    c = sign.get("content") or {}
    ok = _parse(c.get("last_success"))
    if not ok:
        checks.append({"level": "red", "note": "Hasn't loaded postings yet"})
    elif now - ok > timedelta(minutes=60):
        checks.append({"level": "red", "note": f"Postings out of date since {_clock(c.get('last_success'), now)}"})
    elif now - ok > timedelta(minutes=20) or c.get("last_check_ok") is False:
        checks.append({"level": "yellow", "note": "Showing saved postings"})
    w = _worst(checks)
    if w["level"] == "green":
        off = next((k for k in checks if k["note"] == "Screen off for the night"), None)
        w = off or {"level": "green", "note": "Showing current postings"}
    return dict(name, level=w["level"], note=w["note"])


# ---------------------------------------------------------------- the file
def build_public_status(report, signs, now=None):
    """report: the dict system_health.py builds. signs: {filename: sign check-in dict}."""
    now = now or datetime.now(timezone.utc)
    systems = [microsoft(report), portal_sync(report, now)]
    names = sorted(signs)
    for n in names:
        sg = signs[n] or {}
        label = sg.get("sign") or n.replace("winchester-status-sign-", "").replace(".json", "")
        systems.append(window_sign(sg, label, len(names) > 1, now))
    systems = [{k: s[k] for k in PUBLIC_FIELDS} for s in systems]
    return {"version": 1, "generated": now.strftime("%Y-%m-%dT%H:%M:%SZ"), "systems": systems}


def needs_commit(new, old, now=None, heartbeat=timedelta(minutes=50)):
    """Commit when a light or note changed, or the published file is getting old."""
    now = now or datetime.now(timezone.utc)
    if not isinstance(old, dict) or old.get("systems") != new.get("systems"):
        return True
    published = _parse(old.get("generated"))
    return not published or now - published >= heartbeat
