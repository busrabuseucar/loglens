"""Pure-Python reference engine. All windows include both endpoints."""

from __future__ import annotations

import csv
import io
import ipaddress
import re
from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone

MAX_BYTES = 2 * 1024 * 1024
MAX_ROWS = 20_000
REQUIRED = ("timestamp", "ip", "username", "status")
DATE_PATTERN = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$")


def _date(value: str) -> tuple[str, int]:
    if not DATE_PATTERN.fullmatch(value):
        raise ValueError("timestamp: saat dilimi içeren ISO 8601 gerekli")
    if not value.endswith("Z") and (int(value[-5:-3]) > 23 or int(value[-2:]) > 59):
        raise ValueError("timestamp: geçersiz saat dilimi")
    dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if not 2000 <= dt.year <= 2100:
        raise ValueError("timestamp: yıl 2000–2100 arasında olmalı")
    utc = dt.astimezone(timezone.utc)
    milliseconds = (utc - datetime(1970, 1, 1, tzinfo=timezone.utc)) // timedelta(milliseconds=1)
    return utc.isoformat(timespec="milliseconds").replace("+00:00", "Z"), milliseconds


def parse_csv(text: str) -> dict:
    """Validate, normalize, deduplicate, and sort a bounded CSV document."""
    if len(text.encode("utf-8")) > MAX_BYTES:
        raise ValueError("Dosya en fazla 2 MB olabilir.")
    text = text.removeprefix("\ufeff")
    # Count separators only outside quoted header fields.
    counts, quoted = {",": 0, ";": 0}, False
    for char in text:
        if char == '"':
            quoted = not quoted
        elif not quoted:
            if char in "\r\n":
                break
            if char in counts:
                counts[char] += 1
    delimiter = ";" if counts[";"] > counts[","] else ","
    # Strict grammar shared with the browser: quotes may only start a field.
    in_quotes, after_quote, start = False, False, True
    i = 0
    while i < len(text):
        c = text[i]
        if in_quotes:
            if c == '"':
                if i + 1 < len(text) and text[i + 1] == '"':
                    i += 1
                else:
                    in_quotes, after_quote = False, True
        elif c == '"':
            if not start:
                raise ValueError("CSV tırnak yapısı geçersiz.")
            in_quotes, start = True, False
        elif c == delimiter or c in "\r\n":
            start, after_quote = True, False
        elif after_quote:
            raise ValueError("CSV tırnak yapısı geçersiz.")
        else:
            start = False
        i += 1
    if in_quotes:
        raise ValueError("CSV içinde kapanmamış tırnak var.")
    # The file-wide bound also bounds each field; avoid csv's smaller default.
    csv.field_size_limit(max(csv.field_size_limit(), MAX_BYTES))
    try:
        rows = list(csv.reader(io.StringIO(text, newline=""), delimiter=delimiter, strict=True))
    except csv.Error as exc:
        raise ValueError("CSV yapısı geçersiz.") from exc
    if not rows:
        raise ValueError("CSV dosyası boş.")
    headers = [h.strip().lower() for h in rows[0]]
    if len(headers) != len(set(headers)):
        raise ValueError("Tekrarlanan sütun adı var.")
    missing = [h for h in REQUIRED if h not in headers]
    if missing:
        raise ValueError("Eksik sütun: " + ", ".join(missing))
    if len(rows) - 1 > MAX_ROWS:
        raise ValueError("En fazla 20.000 veri satırı yükleyebilirsin.")
    events, errors, seen = [], [], set()
    duplicates = total = 0
    for line, row in enumerate(rows[1:], 2):
        if not any(cell.strip() for cell in row):
            continue
        total += 1
        try:
            if len(row) != len(headers):
                raise ValueError("Sütun sayısı başlıkla uyuşmuyor")
            record = dict(zip(headers, (c.strip() for c in row)))
            iso, milliseconds = _date(record["timestamp"])
            try:
                ip = str(ipaddress.IPv4Address(record["ip"]))
            except ipaddress.AddressValueError:
                raise ValueError("ip: geçerli IPv4 adresi gerekli") from None
            username, source = record["username"], record.get("source", "") or "—"
            if not username or len(username) > 128:
                raise ValueError("username: 1–128 karakter gerekli")
            if len(source) > 128:
                raise ValueError("source: en fazla 128 karakter olabilir")
            status = record["status"].lower()
            if status not in ("success", "failure"):
                raise ValueError("status: success veya failure olmalı")
            key = (iso, ip, username, status, source)
            if key in seen:
                duplicates += 1
                continue
            seen.add(key)
            events.append(dict(timestamp=iso, ms=milliseconds, ip=ip, username=username, status=status, source=source, row=line))
        except (ValueError, OverflowError) as exc:
            errors.append({"row": line, "reason": str(exc)})
    events.sort(key=lambda x: (x["ms"], x["row"]))
    return dict(events=events, errors=errors, duplicates=duplicates, total=total)


def analyze(events: list[dict]) -> dict:
    """Return strongest finding per IP/rule, or per IP/account for R3."""
    events = sorted(events, key=lambda x: (x["ms"], x["row"]))
    failures = defaultdict(list)
    for event in events:
        if event["status"] == "failure":
            failures[event["ip"]].append(event)
    alerts = []

    def finding(rule, ip, window, score, username=None):
        return dict(id=f"{rule}:{ip}" + (f":{username}" if username is not None else ""),
                    rule=rule, severity="high" if rule in ("R2", "R3") else "medium", ip=ip,
                    username=username, start=window[0]["timestamp"], end=window[-1]["timestamp"],
                    count=len(window), users=sorted({e["username"] for e in window}),
                    rows=[e["row"] for e in window], score=score)

    for ip, group in failures.items():
        for rule, minutes in (("R1", 5), ("R2", 10)):
            left, counts, best = 0, defaultdict(int), None
            for right, event in enumerate(group):
                counts[event["username"]] += 1
                while event["ms"] - group[left]["ms"] > minutes * 60_000:
                    old = group[left]
                    left += 1
                    counts[old["username"]] -= 1
                    if counts[old["username"]] == 0:
                        del counts[old["username"]]
                score = right - left + 1 if rule == "R1" else len(counts)
                if score >= 5 and (best is None or score > best[2]):
                    best = (left, right, score)
            if best:
                alerts.append(finding(rule, ip, group[best[0]:best[1] + 1], best[2]))

    pending, strongest = defaultdict(deque), {}
    for event in events:
        key = (event["ip"], event["username"])
        window = pending[key]
        while window and event["ms"] - window[0]["ms"] > 300_000:
            window.popleft()
        if event["status"] == "failure":
            window.append(event)
        else:
            if len(window) >= 3:
                item = finding("R3", event["ip"], list(window) + [event], len(window), event["username"])
                if key not in strongest or item["score"] > strongest[key]["score"]:
                    strongest[key] = item
            window.clear()
    alerts.extend(strongest.values())
    alerts.sort(key=lambda a: (0 if a["severity"] == "high" else 1, a["rule"], a["ip"], a["username"] or ""))
    return {"alerts": alerts, "summary": {
        "total": len(events), "success": sum(e["status"] == "success" for e in events),
        "failure": sum(e["status"] == "failure" for e in events),
        "ips": len({e["ip"] for e in events}), "users": len({e["username"] for e in events}),
        "flaggedIps": len({a["ip"] for a in alerts}),
    }}


def report_csv(alerts: list[dict]) -> str:
    output = io.StringIO(newline="")
    writer = csv.writer(output, lineterminator="\n")
    writer.writerow(["rule", "severity", "ip", "username", "start_utc", "end_utc", "event_count", "users", "csv_rows"])
    for item in alerts:
        values = [item["rule"], item["severity"], item["ip"], item["username"] or "", item["start"], item["end"], item["count"], " | ".join(item["users"]), " | ".join(map(str, item["rows"]))]
        writer.writerow(["'" + str(v) if str(v).startswith(("=", "+", "-", "@", "\t", "\r")) else v for v in values])
    return output.getvalue()


def timeline(events: list[dict]) -> list[dict]:
    """At least five-minute bins, at most 288 bins even across distant years."""
    if not events:
        return []
    start, end = min(e["ms"] for e in events), max(e["ms"] for e in events)
    width = max(300_000, (end - start + 288) // 288)
    bins = [{"timestamp": datetime.fromtimestamp((start + i * width) / 1000, timezone.utc),
             "success": 0, "failure": 0} for i in range((end - start) // width + 1)]
    for event in events:
        bins[(event["ms"] - start) // width][event["status"]] += 1
    return bins
