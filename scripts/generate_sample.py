"""Generate deterministic synthetic documentation-range IPv4 records."""
import csv
from datetime import datetime, timedelta, timezone
from pathlib import Path

root = Path(__file__).resolve().parents[1]
start = datetime(2026, 9, 4, 9, tzinfo=timezone.utc)
rows = []

def add(seconds, ip, user, status, source="web-portal"):
    rows.append([(start + timedelta(seconds=seconds)).isoformat().replace("+00:00", "Z"), ip, user, status, source])

for i in range(144):
    add(i * 50, f"192.0.2.{10 + i % 12}", f"user_{1 + i % 8:02}", "failure" if i % 13 == 0 else "success")
for i in range(7):
    add(920 + i * 35, "198.51.100.23", "demo_admin", "failure", "vpn")
for i in range(6):
    add(3100 + i * 75, "203.0.113.42", f"team_{i + 1:02}", "failure", "web-portal")
for i in range(3):
    add(5100 + i * 45, "198.51.100.77", "demo_analyst", "failure", "vpn")
add(5260, "198.51.100.77", "demo_analyst", "success", "vpn")
rows.sort()
for filename, data in [("sample.csv", rows), ("template.csv", [])]:
    with (root / "dist" / filename).open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle, lineterminator="\n")
        writer.writerow(["timestamp", "ip", "username", "status", "source"])
        writer.writerows(data)
print(f"Generated {len(rows)} synthetic events")
