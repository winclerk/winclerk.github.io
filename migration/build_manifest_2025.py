"""Builds migration/manifest_2025.json: every 2025 website agenda/minutes
file, where it goes in SharePoint, its new name, and the approval finding
behind any DRAFT label."""
import json

W = "https://winchesterwi.com/wp-content/uploads/"
TB = {"site": "/sites/TownBoard", "library": "Documents"}
REG = "All Town Board Files/Previous Regular Meetings"
SPE = "All Town Board Files/Previous Special Meetings"
BCC = "/sites/BoardsCommitteesCommissions"

entries = []


def add(src, site, library, folder, name, note=""):
    entries.append({"source": W + src, "site": site, "library": library,
                    "folder": folder, "name": name, "note": note})


def tb(kind, folder_prefix, ymd, agenda=None, minutes=None, minutes_status="final", note="",
       agenda_name=None, minutes_name=None, extra=()):
    base = REG if kind == "regular" else SPE
    folder = f"{base}/{folder_prefix}_{ymd}"
    code = folder_prefix if folder_prefix in ("RTBM", "STBM", "BOR") else folder_prefix
    if agenda:
        ext = agenda.rsplit(".", 1)[1]
        add(agenda, TB["site"], TB["library"], folder, agenda_name or f"Agenda_{code}_{ymd}.{ext}")
    if minutes:
        ext = minutes.rsplit(".", 1)[1]
        suffix = "_DRAFT" if minutes_status == "draft" else ""
        add(minutes, TB["site"], TB["library"], folder,
            minutes_name or f"Minutes_{code}_{ymd}{suffix}.{ext}", note)
    for src, nm in extra:
        add(src, TB["site"], TB["library"], folder, nm)


# ---------------- Town Board ----------------
tb("regular", "RTBM", "20250106", "2025/01/Agenda-January-6-2025-1.pdf", "2025/03/Minutes-January-6-2025.pdf",
   note="Approved with corrections 2025-02-03; website copy posted after approval")
tb("special", "STBM", "20250108", "2025/01/Agenda-Special-Meeting-January-8-2025.pdf")
tb("regular", "RTBM", "20250203", "2025/01/Agenda-February-3-2025.pdf", "2025/03/Minutes-February-3-2025.pdf",
   note="Approved with a correction 2025-03-03; website copy posted after approval")
tb("special", "STBM", "20250212", "2025/02/Agenda-Special-Meeting-February-12-2025.pdf",
   "2025/03/Minutes-Special-Meeting-February-12-2025.pdf", note="Approved 2025-03-03")
tb("special", "STBM", "20250222", "2025/02/Agenda-Special-Closed-Session-Meeting-February-22-2025.pdf",
   "2025/03/Minutes-Special-Meeting-February-22-2025.pdf", note="Approved 2025-03-03")
tb("regular", "RTBM", "20250303", "2025/02/Agenda-March-3-2025.pdf", "2025/03/Minutes-March-3-2025.pdf",
   note="Approved as presented 2025-04-07")
tb("special", "STBM", "20250307", "2025/03/Agenda-March-7-2025.pdf",
   "2025/03/Minutes-Special-Meeting-March-7-2025.pdf", note="Approved 2025-04-07")
tb("special", "STBM", "20250310", "2025/03/Agenda-Special-Meeting-March-10-2025.pdf",
   "2025/03/Minutes-Special-Meeting-March-10-2025.pdf", note="Approved 2025-04-07")
tb("regular", "RTBM", "20250407", "2025/04/Agenda-April-7-2025.doc.pdf", "2025/04/Minutes-April-7-2025.pdf",
   note="Approved as presented 2025-05-05")
tb("special", "Annual-Town-Meeting", "20250415", "2025/04/Agenda-Annual-Town-Meeting-4-15-25.pdf",
   "2025/04/Annual.Meeting.Minutes.4-15-25.DRAFT_.pdf",
   note="Website copy labeled DRAFT; approved as presented by the Town Board 2025-05-05")
tb("special", "STBM", "20250415", "2025/04/Agenda-Special-Meeting-April-15-2025.pdf",
   "2025/04/Special.Meeting.Minutes.4-15-25.DRAFT_.pdf",
   note="Website copy labeled DRAFT; approved as presented 2025-05-05")
tb("special", "STBM", "20250421", "2025/04/Special.Meeting.Agenda.4-17-25.pdf",
   "2025/04/Special.Meeting.Minutes.4-21-25.DRAFT_.pdf", minutes_status="draft",
   note="No approval found in the May 5 or June 2, 2025 minutes")
tb("regular", "RTBM", "20250505", "2025/04/Town.Board_.agenda.5-5-25.pdf",
   "2025/04/Town.Board_.meeting.minutes.5-5-25.pdf", note="Approved as presented 2025-06-02")
tb("special", "Annual-Town-Meeting", "20250505", "2025/04/2025-Annual-Town-Meeting-agenda.pdf",
   "2025/04/Annual.Meeting.minutes.5-5-25.DRAFT_.pdf", minutes_status="draft",
   note="No approval found (not in Town Board minutes; 2026 annual meeting did not approve prior minutes)")
tb("special", "Board-of-Review", "20250602", "2025/05/BORtoRecess.agenda.6-2-25.pdf",
   "2025/06/BOR.meeting-to-recess.6-2-25.DRAFT_.pdf",
   agenda_name="Agenda_BOR_20250602.pdf", minutes_name="Minutes_BOR_20250602.pdf",
   note="Website copy labeled DRAFT; approved as presented 2025-07-14")
tb("regular", "RTBM", "20250602", "2025/05/Town.Board_.agenda.6-2-25.pdf",
   "2025/06/Town.Board_.minutes.reg_.6-2-25.DRAFT_.pdf",
   note="Website copy labeled DRAFT; approved as presented 2025-07-14")
tb("special", "STBM", "20250618", "2025/06/Town.Board_.agenda.special-meeting.6-18.pdf",
   "2025/06/Town.Board_.minutes.special-meeting-6-18.final_.pdf", note="Approved as presented 2025-07-14")
tb("special", "STBM", "20250701", "2025/06/Town.Board_.agenda.special-meeting.7-1.pdf",
   "2025/06/Town.Board_.minutes-special-meeting-7.01.25.pdf",
   note="Posted without DRAFT label; approval motion not found in Jul 14 or Aug 11 minutes")
tb("regular", "RTBM", "20250714", "2025/07/Town-Board-agenda-7-14-25.pdf",
   "2025/07/Town.Board_.minutes-7.14.25.final_.pdf", note="Approved 2025-08-11 with a typo fix; this is the final copy")
tb("special", "STBM", "20250730", "2025/07/Town-Board-agenda-special-meeting-7.30.25.pdf",
   "2025/07/Town.Board_.minutes-special-meeting-7.30.25.DRAFT_.pdf",
   note="Website copy labeled DRAFT; approved as presented 2025-08-11")
tb("regular", "RTBM", "20250811", "2025/08/Town-Board-agenda-8.11.2025.pdf",
   "2025/08/Town-Board-minutes-8.11.25.DRAFT_.pdf", minutes_status="draft",
   note="Approved 2025-09-08 once a typo was corrected; no corrected copy found")
tb("regular", "RTBM", "20250908", "2025/09/Town-Board-agenda-9.08.2025-revised.pdf",
   "2025/09/Town-Board-minutes-9.8.2025.DRAFT_.pdf", minutes_status="draft",
   note="No approval found (Oct 13 tabled approvals; Nov 10 approved October minutes only)")
tb("special", "STBM", "20250910", "2025/09/Town-Board-agenda-special-meeting-9.10.2025.pdf",
   "2025/09/Town-Board-special-meeting-minutes-9.10.2025.DRAFT_.pdf", minutes_status="draft",
   note="No approval found")
tb("special", "STBM", "20251007", "2025/10/Town-Board-agenda-special-meeting-10.07.2025.pdf",
   "2025/10/Town.Board_.minutes.special.meeting-10.07.25.DRAFT_.pdf",
   note="Website copy labeled DRAFT; approved as presented 2025-11-10")
tb("regular", "RTBM", "20251013", "2025/10/Town-Board-agenda-10.13.2025.pdf",
   "2025/10/Town-Board-minutes-10.13.2025.DRAFT_.pdf",
   note="Website copy labeled DRAFT; approved as presented 2025-11-10")
tb("special", "STBM", "20251017", "2025/10/Town-Board-agenda-special-meeting-10.17.2025.pdf",
   "2025/10/Town.Board_.minutes.special.meeting-10.17.25.DRAFT_.pdf",
   note="Website copy labeled DRAFT; approved as presented 2025-11-10")
tb("special", "STBM", "20251024", "2025/10/Town-Board-agenda-special-meeting-10.24.2025.pdf",
   "2025/10/Town.Board_.minutes.special.meeting-10.24.25.DRAFT_.pdf",
   note="Website copy labeled DRAFT; approved as presented 2025-11-10")
tb("special", "STBM", "20251030", "2025/10/Town-Board-agenda-special-meeting-10.30.2025.pdf",
   "2025/10/Town.Board_.minutes.special.meeting-10.30.25.DRAFT_.pdf", minutes_status="draft",
   note="No approval found (not in Nov 10 or Dec 8 approvals)")
tb("regular", "RTBM", "20251110", "2025/11/Town-Board-agenda-11.10.2025.pdf",
   "2025/11/Town-Board-minutes-11.10.2025.DRAFT_.pdf",
   note="Website copy labeled DRAFT; approved as presented 2025-12-08")
tb("special", "Budget-Hearing-and-Electors-Meeting", "20251117", None,
   "2025/10/Town-Board-minutes-special-meeting-11.17.2025.DRAFT_.pdf", minutes_status="draft",
   minutes_name="Minutes_STBM_20251117_DRAFT.pdf",
   note="Approved 2025-12-08 after a supervisor's last name was added; no corrected copy found",
   extra=[("2025/10/2026-Budget-Public-Hearing-Notice-with-Summary-Budget.pdf",
           "Notice_Budget-Hearing-2026_20251117.pdf"),
          ("2025/10/Notice-Special-Meeting-of-Electors-11.17.2025.pdf",
           "Notice_Special-Town-Meeting-of-Electors_20251117.pdf")])
tb("special", "STBM", "20251202", "2025/11/Town-Board-special-meeting-agenda-12.02.2025.pdf",
   "2025/11/Town.Board_.minutes-special-meeting-12.02.25.pdf", minutes_status="draft",
   note="Posted without DRAFT label, but Feb 9, 2026 minutes say December special minutes had not been submitted; no approval found")
tb("regular", "RTBM", "20251208", "2025/12/Town-Board-agenda-12.08.2025.pdf",
   "2025/12/Town-Board-minutes-12.08.2025.DRAFT_.pdf", minutes_status="draft",
   note="Approved 2026-01-12 with three changes (speed limit sign; contract year; formatting); no corrected copy found")
tb("special", "Public-Hearing-ATV-UTV-Ordinance", "20251213", None, None,
   extra=[("2025/12/Public-Hearing-Notice-12.13.2025-ATV.UTV-Ordinance.linkfixed.pdf",
           "Notice_Public-Hearing-ATV-UTV-Ordinance_20251213.pdf")])
tb("special", "STBM", "20251216", "2025/12/Town-Board-special-meeting-agenda-12.16.2025.pdf",
   "2025/12/Town-Board-minutes-12.16.2025.pdf", note="Approved as presented 2026-03-09")
tb("special", "STBM", "20251231", "2025/12/Town-Board-special-meeting-agenda-12.31.2025.pdf",
   "2025/12/Town-Board-minutes-12.31.2025.pdf", note="Approved as presented 2026-03-09")

# ---------------- Planning Commission ----------------
PC = (BCC, "Planning Commission", "Agendas & Minutes")
for src, nm, note in [
    ("2025/01/PC-agenda-01-27-25.docx", "Agenda_PC_20250127.docx", "Word file on website"),
    ("2025/02/PC.agenda.2-24-25.pdf", "Agenda_PC_20250224.pdf", ""),
    ("2025/03/PC.agenda.3-24-25.pdf", "Agenda_PC_20250324.pdf", ""),
    ("2025/03/PC.minutes.3-24-25.DRAFT_.pdf", "Minutes_PC_20250324.pdf",
     "Website copy labeled DRAFT; approved at the Apr 28, 2025 meeting"),
    ("2025/04/PC-4-28-25.pdf", "Agenda_PC_20250428.pdf", ""),
    ("2025/04/PC.minutes.4-28-25.pdf", "Minutes_PC_20250428.pdf", ""),
    ("2025/05/Pc.agenda.5-19-25.pdf", "Agenda_PC_20250519.pdf", ""),
    ("2025/07/PC-minutes-5-19-25_revised_Approval.pdf", "Minutes_PC_20250519.pdf", "Revised copy posted for approval"),
    ("2025/06/PC.agenda.6-23-25.pdf", "Agenda_PC_20250623.pdf", ""),
    ("2025/06/PC.minutes.6.23.25.DRAFT_.pdf", "Minutes_PC_20250623_DRAFT.pdf",
     "No approval found (July 28 minutes not posted)"),
    ("2025/07/PC.agenda.7.28.25.pdf", "Agenda_PC_20250728.pdf", ""),
    ("2025/08/PC.agenda.8.25.25.pdf", "Agenda_PC_20250825.pdf", ""),
    ("2025/08/PC-minutes-draft-8-25-251.pdf", "Minutes_PC_20250825_DRAFT.pdf",
     "Sep 22 minutes record approving 'July 28' minutes; unclear whether Aug 25 was approved"),
    ("2025/09/PC-agenda-9-22-25.pdf", "Agenda_PC_20250922.pdf", ""),
    ("2025/09/cass-PC-minutes-Sept-22.pdf", "Minutes_PC_20250922.pdf", "Posted without DRAFT label"),
    ("2025/10/PC-agenda-10-27-25.pdf", "Agenda_PC_20251027.pdf", ""),
    ("2025/10/PC-October-2025-minutes.DRAFT_.pdf", "Minutes_PC_20251027_DRAFT.pdf",
     "No approval found (Nov 24 minutes not posted)"),
    ("2025/10/PC-ATV-UTV-sign-committee-agenda-10-27-25.pdf", "Agenda_PC-ATV-UTV-Sign-Committee_20251027.pdf", ""),
    ("2025/11/PC.agenda.11.24.2025.pdf", "Agenda_PC_20251124.pdf", ""),
]:
    add(src, *PC, nm, note)

# ---------------- Lakes Committee ----------------
for src, folder, nm, note in [
    ("2025/01/Agenda-1-15-25-WTLC.pdf", "Agendas", "Agenda_WTLC_20250115.pdf", ""),
    ("2025/02/WTLC.Minutes.1-15-25.DRAFT_.pdf", "Minutes", "Minutes_WTLC_20250115.pdf",
     "Website copy labeled DRAFT; approved at the Apr 23, 2025 meeting"),
    ("2025/04/WTLC.Agenda.April_.23.2025.pdf", "Agendas", "Agenda_WTLC_20250423.pdf", ""),
    ("2025/04/WTLC.minutes.4-23-25.final_.pdf", "Minutes", "Minutes_WTLC_20250423.pdf", ""),
    ("2025/05/WTLC.agenda.5-28-25.pdf", "Agendas", "Agenda_WTLC_20250528.pdf", ""),
    ("2025/05/WTLC.minutes.5-28-25.final_.pdf", "Minutes", "Minutes_WTLC_20250528.pdf", ""),
    ("2025/06/WTLC.agenda.6-25-25.pdf", "Agendas", "Agenda_WTLC_20250625.pdf", ""),
    ("2025/06/WTLC.minutes.6.25.25.final_.pdf", "Minutes", "Minutes_WTLC_20250625.pdf", ""),
    ("2025/07/WTLC.agenda.7.23.25.pdf", "Agendas", "Agenda_WTLC_20250723.pdf", ""),
    ("2025/07/WTLC-7-23-2025MinutesDraft.pdf", "Minutes", "Minutes_WTLC_20250723.pdf",
     "Website copy labeled Draft; approved at the Aug 27, 2025 meeting"),
    ("2025/08/WTLC.agenda.8-27-25.pdf", "Agendas", "Agenda_WTLC_20250827.pdf", ""),
    ("2025/08/WTLC.minutes.8.27.25.DRAFT_.pdf", "Minutes", "Minutes_WTLC_20250827.pdf",
     "Website copy labeled DRAFT; approved at the Sep 24, 2025 meeting"),
    ("2025/09/WTLC.agenda.9.24.25.pdf", "Agendas", "Agenda_WTLC_20250924.pdf", ""),
    ("2025/09/WTLC-Mtg-minutes-092425.DRAFT_.pdf", "Minutes", "Minutes_WTLC_20250924.pdf",
     "Website copy labeled DRAFT; approved at the Jan 28, 2026 meeting"),
]:
    add(src, BCC, "WTLC", folder, nm, note)

# ---------------- NEMSD ----------------
for src, nm, note in [
    ("2025/01/NEMSD-Agenda-1-16-25.pdf", "Agenda_NEMSD_20250117.pdf",
     "Website lists Jan 17; file name says 1-16"),
    ("2025/08/NEMS-82625-meeting.pdf", "Agenda_NEMSD_20250826.pdf", ""),
    ("2025/12/NEMSD-agenda-DEC-17-25.pdf", "Agenda_NEMSD_20251217.pdf", ""),
]:
    add(src, BCC, "NEMSD", "", nm, note)

# ---------------- Fire & Rescue ----------------
for src, nm in [
    ("2025/05/WFD.agenda.may_.pdf", "Agenda_Fire-Rescue_20250513.pdf"),
    ("2025/06/WINCHESTER-FIRE-AGENDA-6-10-25.pdf", "Agenda_Fire-Rescue_20250610.pdf"),
    ("2025/07/WFD-Agenda-7-8-2025.pdf", "Agenda_Fire-Rescue_20250708.pdf"),
    ("2025/08/WFD-Agenda-Aug-25.pdf", "Agenda_Fire-Rescue_20250812.pdf"),
    ("2025/09/WFD-Mtg-Agenda-9-25.pdf", "Agenda_Fire-Rescue_20250909.pdf"),
    ("2025/10/WFD-Mtg-Agenda-10-14-2025.pdf", "Agenda_Fire-Rescue_20251014.pdf"),
]:
    add(src, BCC, "Fire Department", "", nm)

json.dump({"batch": "2025", "files": entries}, open("migration/manifest_2025.json", "w"), indent=1)
print(len(entries), "files;", sum(1 for e in entries if "_DRAFT" in e["name"]), "kept as DRAFT")
