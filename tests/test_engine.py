import csv
import io
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

from loglens import analyze, parse_csv, report_csv

BASE = datetime(2026, 9, 4, 9, tzinfo=timezone.utc)

def document(rows):
    out = io.StringIO(newline="")
    writer = csv.writer(out, lineterminator="\n")
    writer.writerow(["timestamp", "ip", "username", "status", "source"])
    writer.writerows(rows)
    return out.getvalue()

def row(second=0, ip="192.0.2.1", user="alice", status="failure", source="vpn"):
    return [(BASE + timedelta(seconds=second)).isoformat(), ip, user, status, source]

def report(rows):
    return analyze(parse_csv(document(rows))["events"])

class EngineTests(unittest.TestCase):
    def test_sample_has_expected_evidence(self):
        parsed = parse_csv(Path("dist/sample.csv").read_text())
        result = analyze(parsed["events"])
        self.assertEqual(result["summary"], {"total":161,"success":133,"failure":28,"ips":15,"users":16,"flaggedIps":3})
        self.assertEqual([(a["rule"], a["count"]) for a in result["alerts"]], [("R2",6),("R3",4),("R1",7),("R1",5)])
        for a in result["alerts"]:
            self.assertEqual(len(a["rows"]), a["count"])

    def test_r1_boundary_inclusive_and_outside(self):
        self.assertEqual([a["rule"] for a in report([row(s) for s in [0,60,120,180,300]])["alerts"]], ["R1"])
        self.assertEqual(report([row(s) for s in [0,60,120,180,300.001]])["alerts"], [])

    def test_spray_requires_distinct_users(self):
        self.assertNotIn("R2", [a["rule"] for a in report([row(i*100) for i in range(5)])["alerts"]])
        self.assertEqual([a["rule"] for a in report([row(i*150,user=f"u{i}") for i in range(5)])["alerts"]], ["R2"])

    def test_success_requires_same_ip_and_account(self):
        failures = [row(i*30) for i in range(3)]
        self.assertEqual(report(failures + [row(120,user="bob",status="success")])["alerts"], [])
        self.assertEqual(report(failures + [row(120,ip="192.0.2.2",status="success")])["alerts"], [])
        self.assertEqual([a["rule"] for a in report(failures+[row(300,status="success")])["alerts"]], ["R3"])

    def test_success_resets_failure_counter(self):
        rows = [row(0),row(10),row(20,status="success"),row(30),row(40,status="success")]
        self.assertEqual(report(rows)["alerts"], [])

    def test_sorting_and_deduplication(self):
        original = [row(i*45) for i in range(5)]
        parsed = parse_csv(document(list(reversed(original))+[original[0]]))
        self.assertEqual(parsed["duplicates"],1)
        self.assertEqual(len(parsed["events"]),5)
        self.assertEqual(len(analyze(parsed["events"])["alerts"]),1)

    def test_invalid_rows_are_reported(self):
        invalid = row(); invalid[0] = "2026-02-30T09:00:00Z"
        parsed = parse_csv(document([row(),invalid,row(10,ip="999.1.1.1"),row(20,status="unknown")]))
        self.assertEqual(len(parsed["errors"]),3)
        self.assertEqual(len(parsed["events"]),1)

    def test_timezone_equivalence_and_precision(self):
        a,b = row(),row()
        a[0],b[0]="2026-09-04T09:00:00.001Z","2026-09-04T12:00:00.001+03:00"
        p=parse_csv(document([a,b]))
        self.assertEqual(p["duplicates"],1)
        self.assertEqual(p["events"][0]["ms"]%1000,1)
        a[0]="2026-09-04T12:00:00+02:60"
        self.assertEqual(len(parse_csv(document([a]))["errors"]),1)

    def test_quoted_csv_bom_semicolon(self):
        text='\ufefftimestamp;ip;username;status;source\r\n"2026-09-04T09:00:00Z";192.0.2.1;"A, B\nC";failure;"vp""n"\r\n'
        event=parse_csv(text)["events"][0]
        self.assertEqual(event["username"],"A, B\nC")
        self.assertEqual(event["source"],'vp"n')

    def test_missing_duplicate_headers_and_bad_quotes(self):
        for text in ['time,ip\n','timestamp,ip,username,status,status\n','timestamp,ip,username,status\n"unfinished']:
            with self.assertRaises(ValueError): parse_csv(text)

    def test_csv_formula_injection_is_escaped(self):
        result=report([row(i*20,user="=1+1") for i in range(3)]+[row(80,user="=1+1",status="success")])
        output=list(csv.reader(io.StringIO(report_csv(result["alerts"]))))
        self.assertEqual(output[1][3],"'=1+1")

    def test_size_limit(self):
        with self.assertRaises(ValueError): parse_csv("x" * (2*1024*1024+1))

if __name__ == "__main__":
    unittest.main()
