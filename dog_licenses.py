"""
dog_licenses.py: dog license emails and certificates for the Town of Winchester.

Reads the Dog License Register (SharePoint: Records Archive > Permits >
2026 and Newer > Dog License Register.xlsx, table DogLicenses; found by its
file ID, so it can be renamed or moved within the library) and, for each row:

  1. CONFIRMATION: confirmation_sent is blank and the row has an email
       -> emails "We received your application" (with the QuickBooks pay link
          when payment is still Pending), then stamps confirmation_sent.
  2. CERTIFICATE: status = Issued, tag_number filled, payment_status = Paid,
     license_cert_sent blank
       -> builds a PDF license certificate, saves it to
          2026 and Newer/Dog License Certificates/<year>/, links it in
          license_cert_file, emails it to the owner (if there is an email),
          then stamps license_cert_sent.

Rows imported from Ascent are never emailed (their *_sent cells are pre-filled).
To re-send / reprint a certificate: clear license_cert_sent for that row.

PRIVACY: winclerk.github.io is a PUBLIC repo, so its Actions logs are public.
This script never commits anything and only prints application numbers,
never names, addresses or emails.

Runs from .github/workflows/dog_licenses.yml (after each website submission,
every 30 minutes on weekdays, and on demand from the Actions tab).
Env: AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET (existing secrets).
DRY_RUN=1 builds everything but sends/writes nothing.
"""

import io
import os
import re
import sys
import base64
import urllib.parse
from datetime import datetime, date
from html import escape

import requests
from openpyxl import load_workbook

# ── Settings (successor-editable) ─────────────────────────────────────
DRIVE_ID      = "b!c95LT9gy6kqiItDGFto7RFnHF7mxITJGsCZJt01CCvi1TQvoZoFtT7YMKBgrUG67"  # Records Archive > Permits
REGISTER_ID   = "01UVO6XCVWJUVXVDDT6RDLT4IJZSLYJXH5"   # Dog License Register.xlsx (file ID)
SHEET         = "Register"
TABLE         = "DogLicenses"
FOLDER        = "2026 and Newer"                       # where certificate PDFs are saved
CERT_FOLDER   = "Dog License Certificates"

SEND_FROM   = "luke@winchester.wi.gov"     # real mailbox (clerk@ is a forward, not a mailbox)
CLERK_EMAIL = "clerk@winchester.wi.gov"
CLERK_PHONE = "715-686-2123"
TOWN_ADDR   = "7228 CTH W, Winchester, WI 54557"
APPLY_URL   = "https://winchesterwi.com/dog-license-calculator/"

# QuickBooks pay links: same four as the website module (keep in sync)
PAY_LINKS = {
    ("Yes", False): "https://connect.intuit.com/pay/Winchester/scs-v1-60cde8697e174e12a7c3e9261b63702c6cd06c99c3bc406a95d02f004ae219a2bdaecd29f9ba4aa5a5fc28a964e81394-0?locale=EN_US",
    ("No",  False): "https://connect.intuit.com/pay/Winchester/scs-v1-4ec63a1109954ce7b9fa294ee0804180ce7094654bab4cdca0ef37ddc446689d002a119818454b0dad8b9abc6d881a75-0?locale=EN_US",
    ("Yes", True):  "https://connect.intuit.com/pay/Winchester/scs-v1-696e1a04f5154cad8c87739511d0f5ef053b7e20457f48e4ae5cf4fcb0ec577e9d3e4d6137e14262be22cc5b031a5fcf-0?locale=EN_US",
    ("No",  True):  "https://connect.intuit.com/pay/Winchester/scs-v1-6eb174297cff4ecfba8261f0a96cc00b61d918610b5a4a0a82433e5e8bff4d312fd6881da1104c36811ac1085d178cc2-0?locale=EN_US",
}

LOGO_PATH = "winchester-logo.png"   # in the repo root (optional)
GRAPH     = "https://graph.microsoft.com/v1.0"
DRY_RUN   = os.environ.get("DRY_RUN", "") == "1"
EMAIL_RE  = re.compile(r"^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$")


# ── Small helpers ─────────────────────────────────────────────────────
def s(v):
    if v is None:
        return ""
    if isinstance(v, float) and v.is_integer():
        return str(int(v))
    return str(v).strip()


def as_date(v):
    if isinstance(v, datetime):
        return v.date()
    if isinstance(v, date):
        return v
    t = s(v)
    if not t:
        return None
    if re.fullmatch(r"\d{4,5}(\.\d+)?", t):              # Excel serial number
        from datetime import timedelta
        return (datetime(1899, 12, 30) + timedelta(days=float(t))).date()
    for fmt in ("%Y-%m-%d", "%m/%d/%Y", "%Y-%m-%d %H:%M", "%m/%d/%Y %H:%M"):
        try:
            return datetime.strptime(t[:16], fmt).date()
        except ValueError:
            pass
    return None


def fmt_date(v):
    d = as_date(v)
    return d.strftime("%B %-d, %Y") if d else s(v)


def money(v):
    try:
        return f"${float(v):,.2f}"
    except (TypeError, ValueError):
        return s(v)


def now_stamp():
    try:
        from zoneinfo import ZoneInfo
        n = datetime.now(ZoneInfo("America/Chicago"))
    except Exception:
        n = datetime.now()
    return n.strftime("%Y-%m-%d %H:%M")


def col_letter(i):  # 0-based
    out, i = "", i + 1
    while i:
        i, r = divmod(i - 1, 26)
        out = chr(65 + r) + out
    return out


def safe_filename(t):
    return re.sub(r"[^A-Za-z0-9 ._-]+", "", t).strip()[:80] or "license"


def path_url(*parts):
    return "/".join(urllib.parse.quote(p, safe="") for p in parts)


# ── Graph ─────────────────────────────────────────────────────────────
def get_token():
    r = requests.post(
        f"https://login.microsoftonline.com/{os.environ['AZURE_TENANT_ID']}/oauth2/v2.0/token",
        data={
            "client_id": os.environ["AZURE_CLIENT_ID"],
            "client_secret": os.environ["AZURE_CLIENT_SECRET"],
            "grant_type": "client_credentials",
            "scope": "https://graph.microsoft.com/.default",
        },
        timeout=60,
    )
    r.raise_for_status()
    return r.json()["access_token"]


def item_url(*parts):
    return f"{GRAPH}/drives/{DRIVE_ID}/root:/{path_url(*parts)}:"


REGISTER_URL = f"{GRAPH}/drives/{DRIVE_ID}/items/{REGISTER_ID}"


def fetch_register(token):
    r = requests.get(REGISTER_URL + "/content",
                     headers={"Authorization": f"Bearer {token}"}, timeout=120)
    r.raise_for_status()
    wb = load_workbook(io.BytesIO(r.content), data_only=True)
    ws = wb[SHEET]
    rows = list(ws.iter_rows(values_only=True))
    headers = [s(h) for h in rows[0]]
    out = []
    for vals in rows[1:]:
        if not any(v not in (None, "") for v in vals):
            continue
        out.append({h: v for h, v in zip(headers, vals)})
    return headers, out


def current_sheet_row(token, app_id):
    """Find the row's CURRENT sheet row number right before writing: new
       submissions are inserted at the top, which shifts rows down."""
    r = requests.get(REGISTER_URL + f"/workbook/tables/{TABLE}/columns/application_id",
                     headers={"Authorization": f"Bearer {token}"}, timeout=60)
    r.raise_for_status()
    values = r.json().get("values", [])
    for i, v in enumerate(values):        # values[0] is the header, on sheet row 1
        if v and s(v[0]) == app_id:
            return i + 1
    return None


def write_cells(token, headers, app_id, updates):
    if DRY_RUN:
        print(f"   [dry run] would write {sorted(updates)} for {app_id}")
        return True
    row = current_sheet_row(token, app_id)
    if not row:
        print(f"   ! {app_id}: row not found when writing back")
        return False
    ok = True
    for col, value in updates.items():
        if col not in headers:
            print(f"   ! column {col} missing from register")
            ok = False
            continue
        addr = f"{col_letter(headers.index(col))}{row}"
        url = (REGISTER_URL
               + f"/workbook/worksheets/{urllib.parse.quote(SHEET)}/range(address='{addr}')")
        r = requests.patch(url, headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
                           json={"values": [[value]]}, timeout=60)
        if not r.ok:
            print(f"   ! {app_id}: write {col} failed ({r.status_code})")
            ok = False
    return ok


def upload_pdf(token, year, filename, data):
    if DRY_RUN:
        return "(dry run)"
    url = item_url(FOLDER, CERT_FOLDER, str(year), filename) + "/content"
    r = requests.put(url, headers={"Authorization": f"Bearer {token}", "Content-Type": "application/pdf"},
                     data=data, timeout=120)
    r.raise_for_status()
    return r.json().get("webUrl", "")


def send_mail(token, to_addr, subject, html, attachment=None):
    if DRY_RUN:
        return True
    msg = {
        "subject": subject,
        "body": {"contentType": "HTML", "content": html},
        "toRecipients": [{"emailAddress": {"address": to_addr}}],
        "replyTo": [{"emailAddress": {"address": CLERK_EMAIL}}],
    }
    if attachment:
        name, data = attachment
        msg["attachments"] = [{
            "@odata.type": "#microsoft.graph.fileAttachment",
            "name": name, "contentType": "application/pdf",
            "contentBytes": base64.b64encode(data).decode("ascii"),
        }]
    r = requests.post(f"{GRAPH}/users/{SEND_FROM}/sendMail",
                      headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
                      json={"message": msg, "saveToSentItems": True}, timeout=60)
    if r.status_code == 202:
        return True
    print(f"   ! send failed ({r.status_code})")
    return False


# ── Email HTML ────────────────────────────────────────────────────────
def detail_rows(pairs):
    trs = "".join(
        f'<tr><td style="padding:6px 14px 6px 0;vertical-align:top;font-weight:600;color:#555;font-size:13px;white-space:nowrap;">{escape(k)}</td>'
        f'<td style="padding:6px 0;vertical-align:top;color:#222;font-size:14px;">{escape(v)}</td></tr>'
        for k, v in pairs if v)
    return f'<table style="border-collapse:collapse;margin:18px 0;width:100%;">{trs}</table>'


def wrap(headline, body_html):
    return (
        '<!DOCTYPE html><html><head><meta charset="utf-8"></head>'
        '<body style="margin:0;padding:0;background:#f5f5f5;font-family:Helvetica,Arial,sans-serif;">'
        '<div style="max-width:640px;margin:0 auto;background:#fff;">'
        '<div style="background:#193C3C;padding:18px 26px;">'
        '<div style="color:#A59664;font-size:11px;letter-spacing:1.4px;text-transform:uppercase;font-weight:700;">Town of Winchester, Wisconsin</div>'
        '<div style="color:#fff;font-size:16px;margin-top:2px;">Dog Licensing</div></div>'
        f'<div style="padding:28px 26px;"><h1 style="margin:0 0 14px 0;color:#193C3C;font-size:22px;line-height:1.25;">{escape(headline)}</h1>'
        f'<div style="color:#222;font-size:15px;line-height:1.55;">{body_html}</div></div>'
        '<div style="background:#F5F2EC;padding:16px 26px;color:#6b5f3e;font-size:11px;line-height:1.55;text-align:center;">'
        f'Town of Winchester &middot; {escape(TOWN_ADDR)}<br>{escape(CLERK_PHONE)} &middot; '
        f'<a href="mailto:{CLERK_EMAIL}" style="color:#00505A;">{CLERK_EMAIL}</a></div>'
        '</div></body></html>')


def button(href, label):
    return (f'<p style="margin:18px 0;"><a href="{escape(href)}" style="display:inline-block;background:#00505A;color:#fff;'
            f'text-decoration:none;padding:12px 22px;border-radius:6px;font-weight:600;">{escape(label)}</a></p>')


def confirmation_email(r):
    pending = s(r.get("payment_status")).lower() != "paid"
    late = (as_float(r.get("late_fee")) or 0) > 0
    pay = PAY_LINKS.get((s(r.get("spayed_neutered")) or "No", late), "")
    body = (f'<p>Hello {escape(s(r.get("owner_first")))}, your dog license application for '
            f'<strong>{escape(s(r.get("pet_name")))}</strong> has been received and will be reviewed shortly.</p>')
    body += detail_rows([
        ("Application number", s(r.get("application_id"))),
        ("License year", s(r.get("license_year"))),
        ("Dog", " / ".join(x for x in [s(r.get("pet_name")), s(r.get("breed")), s(r.get("color"))] if x)),
        ("Total due", money(r.get("total_due"))),
        ("Payment", "Received" if not pending else "Not yet reviewed"),
    ])
    if pending and pay:
        body += "<p>If you haven't paid yet, you can pay online now:</p>" + button(pay, f"Pay {money(r.get('total_due'))} with QuickBooks")
    body += ("<p>Once payment is received and your rabies certificate is verified, the Town Clerk will issue the tag. "
             "You'll receive your license certificate confirmation via email.</p>"
             f"<p>For any questions, please call {escape(CLERK_PHONE)} or reply to this email.</p>")
    return wrap("Application received", body)


def certificate_email(r):
    body = (f'<p>Hello {escape(s(r.get("owner_first")))}, the {escape(s(r.get("license_year")))} dog license for '
            f'<strong>{escape(s(r.get("pet_name")))}</strong> has been issued. Your certificate is attached.</p>')
    body += detail_rows([
        ("Tag number", s(r.get("tag_number"))),
        ("Valid through", fmt_date(r.get("end_date")) or f"December 31, {s(r.get('license_year'))}"),
        ("Rabies vaccination expires", fmt_date(r.get("rabies_expiration"))),
    ])
    body += ("<p>Keep the tag on your dog's collar. If you didn't pick up the tag in person, call the Town Clerk at "
             f"{escape(CLERK_PHONE)} to make arrangements or to have it mailed to you.</p>"
             f"<p>For any questions, please call {escape(CLERK_PHONE)} or reply to this email.</p>")
    return wrap("Your dog license", body)


def as_float(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


# ── PDF certificate ───────────────────────────────────────────────────
def build_certificate(r):
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import LETTER
    from reportlab.lib.units import inch
    from reportlab.pdfgen import canvas

    TD, TM, TAN, GOLD = (colors.HexColor(c) for c in ("#193C3C", "#00505A", "#F5F2EC", "#A59664"))
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=LETTER)
    W, H = LETTER
    yr = s(r.get("license_year"))
    c.setTitle(f"{yr} Dog License - Tag {s(r.get('tag_number'))}")
    c.setAuthor("Town of Winchester")

    # Certificate panel (top of the page; full border, no single-edge accent)
    x0, y0, w, h = 0.6 * inch, H - 8.0 * inch, W - 1.2 * inch, 7.4 * inch
    c.setFillColor(colors.white)
    c.setStrokeColor(TD)
    c.setLineWidth(2)
    c.roundRect(x0, y0, w, h, 10, stroke=1, fill=0)
    c.setStrokeColor(GOLD)
    c.setLineWidth(0.75)
    c.roundRect(x0 + 6, y0 + 6, w - 12, h - 12, 7, stroke=1, fill=0)

    top = y0 + h - 0.45 * inch
    lx = x0 + 0.35 * inch
    if os.path.exists(LOGO_PATH):
        try:
            from PIL import Image as PILImage
            from reportlab.lib.utils import ImageReader
            im = PILImage.open(LOGO_PATH).convert("RGBA")
            im.thumbnail((240, 240))
            c.drawImage(ImageReader(im), lx, top - 0.75 * inch, width=0.8 * inch, height=0.8 * inch,
                        preserveAspectRatio=True, mask="auto")
            lx += 0.95 * inch
        except Exception:
            pass
    c.setFillColor(GOLD)
    c.setFont("Helvetica-Bold", 9)
    c.drawString(lx, top - 0.12 * inch, "TOWN OF WINCHESTER  ·  VILAS COUNTY, WISCONSIN")
    c.setFillColor(TD)
    c.setFont("Helvetica-Bold", 24)
    c.drawString(lx, top - 0.48 * inch, f"{yr} Dog License")

    # Tag box (right)
    bx, bw, bh = x0 + w - 2.15 * inch, 1.8 * inch, 0.9 * inch
    by = top - 0.82 * inch
    c.setFillColor(TAN)
    c.setStrokeColor(GOLD)
    c.roundRect(bx, by, bw, bh, 6, stroke=1, fill=1)
    c.setFillColor(TM)
    c.setFont("Helvetica-Bold", 8)
    c.drawCentredString(bx + bw / 2, by + bh - 0.2 * inch, "TAG NUMBER")
    c.setFillColor(TD)
    c.setFont("Helvetica-Bold", 26)
    c.drawCentredString(bx + bw / 2, by + 0.18 * inch, s(r.get("tag_number")))

    def block(x, ytop, title, pairs, colw):
        c.setFillColor(TM)
        c.setFont("Helvetica-Bold", 10)
        c.drawString(x, ytop, title.upper())
        c.setStrokeColor(colors.HexColor("#D8D8D8"))
        c.setLineWidth(0.5)
        c.line(x, ytop - 5, x + colw, ytop - 5)
        yy = ytop - 22
        for k, v in pairs:
            if not v:
                continue
            c.setFillColor(colors.HexColor("#666666"))
            c.setFont("Helvetica", 8)
            c.drawString(x, yy, k)
            c.setFillColor(colors.HexColor("#222222"))
            c.setFont("Helvetica", 11)
            yy -= 1
            for line in wrap_text(v, 40 if colw < 3.4 * inch else 60):
                yy -= 13
                c.drawString(x, yy, line)
            yy -= 15
        return yy

    colw = (w - 0.9 * inch) / 2
    ytop = top - 1.25 * inch
    owner = " ".join(x for x in [s(r.get("owner_first")), s(r.get("owner_last"))] if x)
    addr = "\n".join(x for x in [
        s(r.get("address1")), s(r.get("address2")),
        " ".join(x for x in [s(r.get("city")) + ("," if s(r.get("city")) else ""), s(r.get("state")), s(r.get("zip"))] if x),
    ] if x)
    y1 = block(x0 + 0.35 * inch, ytop, "Owner", [("Name", owner), ("Address", addr), ("Phone", s(r.get("phone")))], colw)
    sexfix = s(r.get("sex"))
    if s(r.get("spayed_neutered")) == "Yes":
        sexfix += " (spayed)" if sexfix.lower() == "female" else " (neutered)"
    y2 = block(x0 + 0.55 * inch + colw, ytop, "Dog", [
        ("Name", s(r.get("pet_name"))), ("Breed", s(r.get("breed"))), ("Color", s(r.get("color"))),
        ("Sex", sexfix), ("Microchip", s(r.get("chip_number"))),
    ], colw)
    ytop2 = min(y1, y2) - 6
    block(x0 + 0.35 * inch, ytop2, "Rabies vaccination", [
        ("Expires", fmt_date(r.get("rabies_expiration"))), ("Veterinarian", s(r.get("veterinarian"))),
        ("Vaccine", " / ".join(x for x in [s(r.get("vaccine_mfr")), s(r.get("vaccine_serial"))] if x)),
    ], colw)
    fee_pairs = [("License fee", money(r.get("license_fee")))]
    if (as_float(r.get("late_fee")) or 0) > 0:
        fee_pairs.append(("Late fee", money(r.get("late_fee"))))
    fee_pairs += [("Total paid", money(r.get("total_due"))),
                  ("Issued", fmt_date(r.get("issued_date")) or fmt_date(date.today())),
                  ("Valid through", fmt_date(r.get("end_date")) or f"December 31, {yr}")]
    block(x0 + 0.55 * inch + colw, ytop2, "License", fee_pairs, colw)

    # Signature line
    sy = y0 + 0.55 * inch
    c.setStrokeColor(TD)
    c.setLineWidth(0.75)
    c.line(x0 + w - 3.4 * inch, sy, x0 + w - 0.35 * inch, sy)
    c.setFillColor(colors.HexColor("#666666"))
    c.setFont("Helvetica", 8)
    c.drawString(x0 + w - 3.4 * inch, sy - 11, "Town Clerk, Town of Winchester")
    c.drawString(x0 + 0.35 * inch, sy - 11, f"Application {s(r.get('application_id'))}")

    # Below the certificate
    c.setFillColor(colors.HexColor("#444444"))
    c.setFont("Helvetica", 9)
    c.drawCentredString(W / 2, y0 - 0.35 * inch,
                        f"Town of Winchester  ·  {TOWN_ADDR}  ·  {CLERK_PHONE}  ·  {CLERK_EMAIL}")
    c.showPage()
    c.save()
    return buf.getvalue()


def wrap_text(text, width):
    lines = []
    for para in str(text).split("\n"):
        words, cur = para.split(), ""
        for wd in words:
            if len(cur) + len(wd) + 1 > width and cur:
                lines.append(cur)
                cur = wd
            else:
                cur = (cur + " " + wd).strip()
        lines.append(cur)
    return lines or [""]


# ── Main ──────────────────────────────────────────────────────────────
def main():
    print("Authenticating with Microsoft Graph...")
    token = get_token()
    headers, rows = fetch_register(token)
    print(f"Register: {len(rows)} rows")
    sent_conf = sent_cert = waiting_pay = 0

    for r in rows:
        app_id = s(r.get("application_id"))
        if not app_id or s(r.get("imported_from")).lower() == "ascent":
            continue
        status = s(r.get("status")).lower()
        if status == "void":
            continue
        email = s(r.get("email"))
        has_email = bool(EMAIL_RE.match(email))
        issued_ready = (status == "issued" and s(r.get("tag_number"))
                        and s(r.get("payment_status")).lower() == "paid")

        # 1. Confirmation
        if not s(r.get("confirmation_sent")):
            if issued_ready:
                write_cells(token, headers, app_id, {"confirmation_sent": "Skipped (issued right away)"})
            elif not has_email:
                write_cells(token, headers, app_id, {"confirmation_sent": "No email on file"})
            else:
                if send_mail(token, email, f"Dog license application received ({app_id})", confirmation_email(r)):
                    write_cells(token, headers, app_id, {"confirmation_sent": now_stamp()})
                    sent_conf += 1
                    print(f" - {app_id}: confirmation sent")

        # 2. Certificate
        if status == "issued" and s(r.get("tag_number")) and not s(r.get("license_cert_sent")):
            if s(r.get("payment_status")).lower() != "paid":
                waiting_pay += 1
                print(f" - {app_id}: issued but payment_status is not Paid; certificate held")
                continue
            pdf = build_certificate(r)
            fname = safe_filename(f"{s(r.get('license_year'))} Tag {s(r.get('tag_number'))} - "
                                  f"{s(r.get('owner_last'))} - {s(r.get('pet_name'))}") + ".pdf"
            try:
                link = upload_pdf(token, s(r.get("license_year")) or "unknown", fname, pdf)
            except Exception as e:
                print(f" - {app_id}: certificate upload failed ({type(e).__name__})")
                continue
            updates = {"license_cert_file": link}
            if has_email:
                if send_mail(token, email, f"Your {s(r.get('license_year'))} dog license for {s(r.get('pet_name'))}",
                             certificate_email(r), attachment=(fname, pdf)):
                    updates["license_cert_sent"] = now_stamp()
                    sent_cert += 1
                    print(f" - {app_id}: certificate saved and emailed")
            else:
                updates["license_cert_sent"] = "PDF saved (no email)"
                print(f" - {app_id}: certificate saved (no email on file)")
            write_cells(token, headers, app_id, updates)

    print(f"Done. Confirmations: {sent_conf}  Certificates emailed: {sent_cert}  Held for payment: {waiting_pay}")


if __name__ == "__main__":
    try:
        main()
    except requests.HTTPError as e:
        code = e.response.status_code if e.response is not None else "?"
        print(f"Graph request failed ({code}). Check that the Dog License Register (file ID {REGISTER_ID}) still exists in Records Archive > Permits.")
        sys.exit(1)
