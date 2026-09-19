#!/usr/bin/env python3
"""Scrub and verify fixture-e2e artifacts before anything is published or uploaded.

The job signs in with a per-run SITE_PASSWORD, seals sessions with a per-run
CYNTRO_SITE_SESSION_SECRET, and the application specs browse with the session cookie the
untraced bootstrap stored. A Playwright trace of an authenticated page records the Cookie
request header, so the SESSION value can legitimately appear in trace archives: it is replaced
with a marker. The PASSWORD and the SECRET should appear nowhere -- no traced code ever sends
them -- so any occurrence fails the run, because silently redacting them would hide a real leak.

Every file under the given paths is checked, including zip members (trace archives) and zips
embedded as base64 data URLs (the HTML report). Only labels and counts are printed, never a value.
Exit 0 = clean; 1 = a password/secret occurrence or any residual value after scrubbing.

Usage: scrub-fixture-artifacts.py PATH [PATH ...]
Values come from the environment: SITE_PASSWORD, CYNTRO_SITE_SESSION_SECRET, and the session
cookie inside the storage-state file named by PW_SITE_SESSION_STATE.
"""
import base64, io, json, os, pathlib, re, sys, urllib.parse, zipfile

COOKIE = "cyntro_auth"
DATA_URL = re.compile(rb"data:application/zip;base64,([A-Za-z0-9+/=]+)")


def variants(value: str) -> list[bytes]:
    forms = {value, urllib.parse.quote(value, safe=""), json.dumps(value)[1:-1]}
    return [f.encode() for f in forms if f]


def load_values() -> tuple[dict, dict]:
    fatal, redact = {}, {}
    for name in ("SITE_PASSWORD", "CYNTRO_SITE_SESSION_SECRET"):
        if os.environ.get(name):
            fatal[name] = variants(os.environ[name])
    state = os.environ.get("PW_SITE_SESSION_STATE")
    if state and pathlib.Path(state).is_file():
        for c in json.loads(pathlib.Path(state).read_text()).get("cookies", []):
            if c.get("name") == COOKIE and c.get("value"):
                redact["site session cookie"] = variants(c["value"])
    return fatal, redact


def count(blob: bytes, table: dict) -> dict:
    return {label: sum(blob.count(v) for v in forms) for label, forms in table.items()
            if any(v in blob for v in forms)}


def scrub(blob: bytes, table: dict) -> bytes:
    for label, forms in table.items():
        for v in forms:
            blob = blob.replace(v, f"<redacted:{label}>".encode())
    return blob


def scrub_zip(blob: bytes, table: dict) -> bytes:
    """Rewrite a zip with every member scrubbed, recursing into zips nested as members: a value
    inside a compressed inner archive is not visible to a byte replace on the outer member."""
    out = io.BytesIO()
    with zipfile.ZipFile(io.BytesIO(blob)) as src, zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as dst:
        for info in src.infolist():
            data = src.read(info)
            dst.writestr(info, scrub_zip(data, table) if data[:4] == b"PK\x03\x04" else scrub(data, table))
    return out.getvalue()


def members(blob: bytes):
    """Yield (name, bytes) for a zip blob and any zip embedded in it or in a data URL."""
    with zipfile.ZipFile(io.BytesIO(blob)) as z:
        for info in z.infolist():
            data = z.read(info)
            yield info.filename, data
            if data[:4] == b"PK\x03\x04":
                yield from members(data)


def main(paths: list[str]) -> int:
    fatal, redact = load_values()
    files = [p for root in paths for p in ([pathlib.Path(root)] if pathlib.Path(root).is_file()
             else sorted(pathlib.Path(root).rglob("*")) if pathlib.Path(root).is_dir() else [])
             if p.is_file()]
    rewritten = 0
    for p in files:
        raw = p.read_bytes()
        if zipfile.is_zipfile(p) and redact:
            # Re-deflating changes bytes even when nothing matched, so rewrite only archives that
            # actually hold a value -- otherwise "rewritten" would count every trace.
            if any(count(data, redact) for _name, data in members(raw)):
                p.write_bytes(scrub_zip(raw, redact)); rewritten += 1
        elif redact and count(raw, redact):
            p.write_bytes(scrub(raw, redact)); rewritten += 1

    residual, scanned = {}, 0
    everything = {**fatal, **redact}
    for p in files:
        raw = p.read_bytes()
        blobs = [(str(p), raw)]
        if zipfile.is_zipfile(p):
            blobs += [(f"{p}!{n}", d) for n, d in members(raw)]
        for m in DATA_URL.finditer(raw):
            embedded = base64.b64decode(m.group(1))
            blobs += [(f"{p}!data-url", embedded)]
            if zipfile.is_zipfile(io.BytesIO(embedded)):
                blobs += [(f"{p}!data-url!{n}", d) for n, d in members(embedded)]
        for where, blob in blobs:
            scanned += 1
            for label, n in count(blob, everything).items():
                residual.setdefault(label, []).append((where, n))

    print(f"artifact scrub: {len(files)} files, {scanned} blobs scanned (incl. zip members and data URLs), "
          f"{rewritten} rewritten; checking {sorted(everything)}")
    if not residual:
        print("artifact scrub: CLEAN -- no password, sealing secret or session cookie remains")
        return 0
    for label, hits in residual.items():
        print(f"artifact scrub: FOUND {label} in {len(hits)} location(s), "
              f"e.g. {hits[0][0]}")  # a path, never the value
    return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
