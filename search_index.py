"""
search_index.py — builds search-index.json, the full-text index behind the
portal's search bar.

How it fits into sync.py:
  1. While sync.py scans SharePoint, every document it publishes is passed to
     register(doc, drive_id, item). Nothing is downloaded at that point.
  2. At the end of the run, build(...) produces search-index.json:
       - PDF and Word (.docx) files have their text extracted.
       - A file is only downloaded again when SharePoint says it changed
         (lastModifiedDateTime differs from the copy already in the index),
         so after the first run the hourly sync only reads new/edited files.
       - Other file types (spreadsheets, videos, etc.) are skipped here; the
         search bar still finds them by name from data.json.
  3. The index is queued with the same batched commit as data.json, so it
     never adds an extra commit or Pages rebuild.

Scanned PDFs (pictures of paper) contain no text layer, so they are stored
with empty text and are only searchable by name.

Index format (one entry per indexed file, sorted by item id so the file only
changes when content changes):
  {"v": 1, "docs": [{"u": <public link, same as data.json>, "i": <item id>,
                     "m": <lastModifiedDateTime>, "t": <extracted text>}]}
"""

import html
import io
import json
import os
import re
import zipfile

from pypdf import PdfReader

INDEX_PATH = "search-index.json"
TEXT_EXTS = {"pdf", "docx"}
MAX_CHARS_PER_DOC = 60000      # keeps very long reports from bloating the index
MAX_PDF_PAGES = 150
MAX_DOWNLOADS_PER_RUN = 400    # safety cap on a single run's downloads

_registered = []


def register(doc, drive_id, item):
    """Remember a published document so build() can index it later."""
    try:
        _registered.append({
            "url": doc.get("url", ""),
            "drive": drive_id,
            "id": item.get("id", ""),
            "name": item.get("name", ""),
            "mod": item.get("lastModifiedDateTime", ""),
        })
    except Exception as e:
        print(f"    Search index: could not register {doc.get('filename')}: {e}")


def _clean(text):
    text = text.replace(" ", " ")
    text = re.sub(r"[ \t\r\f\v]+", " ", text)
    text = re.sub(r"\s*\n\s*", "\n", text)
    text = re.sub(r"\n{2,}", "\n", text)
    return text.strip()[:MAX_CHARS_PER_DOC]


def _pdf_text(data):
    reader = PdfReader(io.BytesIO(data))
    parts = []
    for i, page in enumerate(reader.pages):
        if i >= MAX_PDF_PAGES:
            break
        try:
            parts.append(page.extract_text() or "")
        except Exception:
            continue
    return "\n".join(parts)


def _docx_text(data):
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        xml = z.read("word/document.xml").decode("utf-8", errors="ignore")
    xml = re.sub(r"</w:p>", "\n", xml)
    xml = re.sub(r"<w:tab/>", " ", xml)
    xml = re.sub(r"<w:br/>", "\n", xml)
    text = re.sub(r"<[^>]+>", "", xml)
    return html.unescape(text)


def _extract(name, data):
    ext = name.rsplit(".", 1)[-1].lower() if "." in name else ""
    if ext == "pdf":
        return _pdf_text(data)
    if ext == "docx":
        return _docx_text(data)
    return ""


def _load_existing():
    """Read the index committed by the previous run (the Actions checkout
       has it on disk). Returns {item_id: entry}."""
    if not os.path.exists(INDEX_PATH):
        return {}
    try:
        with open(INDEX_PATH, encoding="utf-8") as f:
            data = json.load(f)
        return {d["i"]: d for d in data.get("docs", []) if d.get("i")}
    except Exception as e:
        print(f"  Search index: could not read existing {INDEX_PATH} ({e}); rebuilding.")
        return {}


def build(token, download_fn, write_fn):
    """Build search-index.json and queue it with write_fn(path, content).
       download_fn(token, drive_id, item_id) -> bytes or None."""
    print("Building search index...")
    existing = _load_existing()
    out = {}
    reused = downloaded = failed = skipped = 0

    for it in _registered:
        item_id = it["id"]
        name = it["name"]
        ext = name.rsplit(".", 1)[-1].lower() if "." in name else ""
        if not item_id or ext not in TEXT_EXTS or item_id in out:
            continue

        prev = existing.get(item_id)
        if prev and prev.get("m") == it["mod"]:
            text = prev.get("t", "")
            reused += 1
        elif downloaded >= MAX_DOWNLOADS_PER_RUN:
            # Over this run's cap: keep the old text if we have it, and
            # pick the file up on a later run.
            text = prev.get("t", "") if prev else ""
            skipped += 1
            if not prev:
                continue
        else:
            data = download_fn(token, it["drive"], item_id)
            downloaded += 1
            if data is None:
                failed += 1
                text = prev.get("t", "") if prev else ""
            else:
                try:
                    text = _clean(_extract(name, data))
                except Exception as e:
                    print(f"    Search index: could not read text from {name}: {e}")
                    failed += 1
                    text = ""

        out[item_id] = {"u": it["url"], "i": item_id, "m": it["mod"], "t": text}

    docs = sorted(out.values(), key=lambda d: d["i"])
    content = json.dumps({"v": 1, "docs": docs}, ensure_ascii=False, separators=(",", ":"))
    write_fn(INDEX_PATH, content)
    with_text = sum(1 for d in docs if d["t"])
    print(f"  Search index: {len(docs)} file(s), {with_text} with text "
          f"({reused} unchanged, {downloaded} downloaded, {failed} failed, {skipped} deferred), "
          f"{len(content) // 1024} KB.")
