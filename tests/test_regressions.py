import importlib.util
import tempfile
import unittest
import zipfile
from pathlib import Path
from loglens.engine import parse_csv, timeline

HEADER = 'timestamp,ip,username,status'
ROW = '2026-09-04T09:00:00Z,192.0.2.1,alice,failure'

class BoundaryTests(unittest.TestCase):
    def test_large_field_is_a_row_error_not_a_parser_crash(self):
        result = parse_csv(HEADER + '\n' + ROW.replace('alice', 'x' * 140000))
        self.assertEqual(len(result['errors']), 1)
        self.assertEqual(result['events'], [])

    def test_quoted_header_does_not_change_delimiter(self):
        result = parse_csv(HEADER + ',"ignored;;;;;;"\n' + ROW + ',' + 'x' * 140000)
        self.assertEqual(len(result['events']), 1)

    def test_century_chart_is_bounded_and_preserves_counts(self):
        events = parse_csv(HEADER + '\n' + ROW.replace('2026-09-04', '2000-01-01') + '\n' + ROW.replace('2026-09-04', '2100-12-31'))['events']
        bins = timeline(events)
        self.assertLessEqual(len(bins), 288)
        self.assertEqual(sum(b['failure'] for b in bins), 2)

    def test_source_archive_excludes_local_files_and_symlinks(self):
        spec = importlib.util.spec_from_file_location('packager', 'scripts/package_source.py')
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for name in ['README.md', 'dist/app.js', '.env.local', 'private.json', 'data.sqlite', '.streamlit/secrets.toml', 'tests/test-results/private.csv']:
                path = root / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text('fixture')
            (root / 'dist/link.js').symlink_to(root / '.env.local')
            with zipfile.ZipFile(module.build_archive(root)) as archive:
                self.assertEqual(set(archive.namelist()), {'loglens/README.md', 'loglens/dist/app.js'})
