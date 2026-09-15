"""
github_batch.py — collect every file a sync run wants to write, then commit
them all in ONE commit at the very end, instead of one Contents-API PUT per
file.

Why this exists: each PUT to /repos/{repo}/contents/{path} creates its own
commit, and every push to `main` triggers GitHub's own "pages build and
deployment" workflow. A single `python sync.py` run that touches data.json,
permits.json, permit_notify_state.json, permit_pdf_state.json and a handful
of permit PDFs was therefore creating 5-10+ commits — and 5-10+ Pages
rebuilds — per run. Batching those into one commit (via the Git Data API:
blobs -> tree -> commit -> ref update) means one push and one Pages deploy
per sync run, no matter how many files changed.

Usage (see sync.py):
    batch = GitHubBatch(GITHUB_REPO, GH_PAT)
    batch.add("data.json", json_text)                      # text
    batch.add("public/permits/2026-DW-01.pdf", pdf_bytes)  # binary (bytes -> binary automatically)
    ...
    batch.flush("Auto-sync from SharePoint [...]")          # call ONCE, at the end
"""

import base64
import requests


class GitHubBatch:
    def __init__(self, repo, token, branch="main"):
        self.repo = repo
        self.branch = branch
        self.headers = {
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github+json",
        }
        self._files = {}  # path -> bytes

    def add(self, path, content):
        """Queue a file write for the next flush(). content may be str (utf-8
           text) or bytes (binary, e.g. a PDF). Last write for a given path
           wins if add() is called twice for the same path before flush()."""
        if isinstance(content, str):
            content = content.encode("utf-8")
        self._files[path] = content

    def has_changes(self):
        return bool(self._files)

    def flush(self, message):
        """Commit every queued file in a single commit + single push.
           Returns the new commit sha, or None if nothing was queued.
           Safe to call even with zero queued files (no-op)."""
        if not self._files:
            print("GitHubBatch: nothing queued, skipping commit.")
            return None

        api = f"https://api.github.com/repos/{self.repo}"

        # 1. Current branch head + its tree, to build on top of.
        ref = requests.get(f"{api}/git/ref/heads/{self.branch}", headers=self.headers, timeout=30)
        ref.raise_for_status()
        base_commit_sha = ref.json()["object"]["sha"]

        base_commit = requests.get(f"{api}/git/commits/{base_commit_sha}", headers=self.headers, timeout=30)
        base_commit.raise_for_status()
        base_tree_sha = base_commit.json()["tree"]["sha"]

        # 2. One blob per queued file.
        tree_entries = []
        for path, content in self._files.items():
            blob = requests.post(
                f"{api}/git/blobs",
                headers=self.headers,
                json={"content": base64.b64encode(content).decode("ascii"), "encoding": "base64"},
                timeout=60,
            )
            blob.raise_for_status()
            tree_entries.append({
                "path": path,
                "mode": "100644",
                "type": "blob",
                "sha": blob.json()["sha"],
            })

        # 3. New tree layered on the current tree (untouched files are kept as-is).
        tree = requests.post(
            f"{api}/git/trees",
            headers=self.headers,
            json={"base_tree": base_tree_sha, "tree": tree_entries},
            timeout=60,
        )
        tree.raise_for_status()
        new_tree_sha = tree.json()["sha"]

        # 4. New commit pointing at that tree, parented on the current head.
        new_commit = requests.post(
            f"{api}/git/commits",
            headers=self.headers,
            json={"message": message, "tree": new_tree_sha, "parents": [base_commit_sha]},
            timeout=30,
        )
        new_commit.raise_for_status()
        new_commit_sha = new_commit.json()["sha"]

        # 5. Fast-forward the branch ref. force=False so if something else
        #    pushed to main in between, this fails loudly instead of
        #    silently overwriting it (the run will error and can be retried).
        update = requests.patch(
            f"{api}/git/refs/heads/{self.branch}",
            headers=self.headers,
            json={"sha": new_commit_sha, "force": False},
            timeout=30,
        )
        update.raise_for_status()

        print(f"GitHubBatch: committed {len(self._files)} file(s) in one commit ({new_commit_sha[:7]}).")
        self._files.clear()
        return new_commit_sha
