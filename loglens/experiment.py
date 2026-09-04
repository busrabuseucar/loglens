"""Reproducible R3 lesson over the bundled synthetic sample."""
import csv
import io
from datetime import datetime, timezone

from .engine import analyze, parse_csv


def run_r3_experiment(sample_csv: str, elapsed_seconds: int = 160) -> dict:
    if type(elapsed_seconds) is not int or not 160 <= elapsed_seconds <= 600:
        raise ValueError("Deney süresi 160–600 saniye arasında tam sayı olmalı.")
    original = parse_csv(sample_csv)["events"]
    scenario = [e for e in original if e["ip"] == "198.51.100.77" and e["username"] == "demo_analyst"]
    failures = [e for e in scenario if e["status"] == "failure"]
    successes = [e for e in scenario if e["status"] == "success"]
    if len(failures) != 3 or len(successes) != 1:
        raise ValueError("Deney için gereken dört örnek kayıt bulunamadı.")
    target = successes[0]
    success_ms = failures[0]["ms"] + elapsed_seconds * 1000

    def iso(ms):
        return datetime.fromtimestamp(ms / 1000, tz=timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")

    events = [{**e, "ms": success_ms, "timestamp": iso(success_ms)} if e is target else dict(e) for e in original]
    result, baseline = analyze(events), analyze(original)
    scenario_rows = {e["row"] for e in scenario}
    evidence = [e for e in events if e["row"] in scenario_rows]
    in_window_rows = [e["row"] for e in evidence if e["status"] == "failure" and 0 <= success_ms - e["ms"] <= 300000]
    active = any(a["rule"] == "R3" and a["ip"] == target["ip"] and a["username"] == target["username"] for a in result["alerts"])
    output = io.StringIO(newline="")
    writer = csv.writer(output, lineterminator="\n")
    fields = ["timestamp", "ip", "username", "status", "source"]
    writer.writerow(fields)
    for event in sorted(events, key=lambda e: (e["ms"], e["row"])):
        # The sample is synthetic; keep the normal export's formula protection.
        writer.writerow(["'" + event[k] if event[k].startswith(("=", "+", "-", "@", "\t", "\r")) else event[k] for k in fields])
    return {"elapsedSeconds": elapsed_seconds, "active": active,
            "successTimestamp": iso(success_ms), "windowStart": iso(success_ms - 300000),
            "inWindowRows": in_window_rows, "baselineFindings": len(baseline["alerts"]),
            "findings": len(result["alerts"]), "evidence": evidence, "csv": output.getvalue()}
