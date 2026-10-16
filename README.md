# LogLens

**Explainable authentication-log analysis — Python reference app and a browser-only demo.**

LogLens finds suspicious login patterns in a bounded CSV file. Each finding includes the rule, IP address, exact time window, affected accounts and source record numbers. There is no ML model, hidden risk score or claim that a finding proves an attack.

[![LogLens checks](https://github.com/busrabuseucar/loglens/actions/workflows/ci.yml/badge.svg)](https://github.com/busrabuseucar/loglens/actions/workflows/ci.yml)

[Live demo](https://loglens-buse.sleek-brush-8818.chatgpt.site) · [CSV example](dist/sample.csv)

The hosted browser demo is public and can be opened by anyone with the link. Use it to try the sample data or analyze a CSV locally in your browser. This repository contains the complete source.

## What works

- Upload UTF-8 CSV, or load 161 synthetic authentication records with one click.
- Validate required fields, dates, IPv4 addresses and allowed outcomes.
- Remove identical duplicate events before calculating thresholds.
- Detect three documented patterns with inclusive rolling time windows.
- Inspect statistics, time distribution, findings and the original evidence records.
- Search and filter findings or events; paginate the event list.
- Export currently visible findings to CSV, with spreadsheet formula escaping.
- Explore the R3 time window with a one-second slider, four presets and a downloadable modified sample. The experiment uses an isolated copy of synthetic data.
- Run the Python/Streamlit version locally, or use the static browser demo.
- Verify the two engines against 42 shared fixtures.
- Verify four R3 experiment presets across Python and JavaScript.

## Quick start — Python

Requires Python 3.12. Clone this repository, then use a virtual environment.

```bash
git clone https://github.com/busrabuseucar/loglens.git
cd loglens
```

```bash
python -m venv .venv
```

Activate it on macOS/Linux:

```bash
source .venv/bin/activate
```

Or on Windows PowerShell:

```powershell
.venv\Scripts\Activate.ps1
```

Install and start:

```bash
python -m pip install -r requirements.txt
python -m streamlit run app.py
```

The Python app uses pandas for aggregation and Streamlit for the UI. Its analysis module uses the Python standard library only and can be imported independently.

## Quick start — browser demo

The web UI uses vanilla JavaScript, HTML and CSS. No npm install or build is required.

```bash
python scripts/package_source.py
python -m http.server 8000 --directory dist
```

Open `http://localhost:8000`. Use HTTP rather than double-clicking the HTML file: browser module loading and the sample-file request require a web origin. The local source ZIP download is generated with `python scripts/package_source.py` if it is not present.

## Rules

| Rule | Grouping | Trigger | Priority |
| --- | --- | --- | --- |
| R1 | IPv4 address | At least 5 failures in an inclusive 5-minute window | Medium |
| R2 | IPv4 address | Failed attempts on at least 5 distinct accounts in an inclusive 10-minute window | High |
| R3 | IPv4 address + case-sensitive account | A success preceded by at least 3 failures since the preceding success, all within an inclusive 5-minute window | High |

An endpoint exactly 5 or 10 minutes after the first event is included; one millisecond outside is excluded. Input is sorted chronologically. Equal timestamps retain input record order. R3 resets after every success on the same IP/account.

For R1/R2, report only the strongest window per IP and rule. R1 strength is failure count; R2 strength is distinct-account count. R3 reports the strongest episode per IP/account, measured by preceding failures. Equal scores keep the first episode. A single record can therefore support multiple findings. The same IP across different `source` values is grouped together.

### Expected sample result

| Metric | Expected value |
| --- | --- |
| Valid unique records | 161 |
| Successful / failed logins | 133 / 28 |
| Distinct IP addresses | 15 |
| Flagged IP addresses | 3 |
| Findings | 4: two R1, one R2, one R3 |

The sample is deterministic and fictional. It uses the documentation IPv4 ranges `192.0.2.0/24`, `198.51.100.0/24` and `203.0.113.0/24`. It does not contain customer logs.

### Interactive R3 lesson

Open **R3 deneyi** in either app. Failures occur at 10:25:00, 10:25:45 and 10:26:30 UTC on the same IP/account. Only the success timestamp is varied. Counts below describe the experiment's full 161-record sample; the main uploaded analysis is unchanged.

| Preset | Success time UTC | Failures in the preceding 5 minutes | R3 finding | Total findings |
| --- | --- | --- | --- | --- |
| Original — 160 seconds | 10:27:40 | 3 | Yes | 4 |
| Exact boundary — 300 seconds | 10:30:00 | 3 | Yes | 4 |
| Boundary +1 second — 301 seconds | 10:30:01 | 2 | No | 3 |
| Late success — 600 seconds | 10:35:00 | 0 | No | 3 |

The result calls the same rule engine used by the normal analysis, rather than returning a hard-coded answer for the slider. **Deney CSV’sini indir** exports the full altered synthetic sample; uploading it in the main analysis reproduces its count.

## CSV contract

```csv
timestamp,ip,username,status,source
2026-09-04T12:00:00+03:00,192.0.2.10,demo_user,failure,vpn
2026-09-04T12:01:00+03:00,192.0.2.10,demo_user,success,vpn
```

| Field | Requirement |
| --- | --- |
| `timestamp` | Required. ISO 8601 date-time with seconds and `Z` or `±HH:MM`. Optional 1–3 fractional digits. Local year 2000–2100. |
| `ip` | Required. IPv4, four decimal octets, no leading zeros. |
| `username` | Required. 1–128 characters after trimming; case-sensitive. |
| `status` | Required. `success` or `failure`, case-insensitive. |
| `source` | Optional. Up to 128 characters; absent or blank becomes `—`. |

- Maximum 2 MiB and 20,000 CSV data records. Limits include invalid/blank records in the row-cap check.
- UTF-8, optional BOM, comma or semicolon, LF/CRLF. The header determines the delimiter.
- Standard quoted cells, escaped double quotes and embedded newlines are supported. Quotes must start a field; non-delimiter text after a closing quote is rejected.
- Header whitespace and case are normalized; duplicate or missing required headers reject the file.
- Unknown extra columns are ignored. Bad value rows are excluded with explanations. A malformed CSV document is rejected atomically.
- Duplicate key: normalized UTC timestamp, IP, account, status and source. Imported record numbers refer to CSV records with the header counted as record 1, not physical text lines when a cell contains newlines.
- A file with no valid events does not replace the current UI analysis.

## Privacy and boundaries

The **static demo** processes uploads entirely in the browser. Only its own application assets and fictional example CSV are fetched. No uploaded file, account name or IP is sent to an API, analytics service, localStorage or external model. Refreshing the page discards the uploaded dataset.

The **Streamlit app** processes files in its Python process. With a local launch, this runs on the user's computer. If someone hosts it on a remote server, uploads are sent to that server. The two deployment models have different privacy properties; do not describe a remotely hosted Streamlit app as browser-only.

Findings prioritize manual investigation. NAT/shared networks, password mistakes and legitimate automation can cause false positives. These rules do not identify malicious intent, and zero findings is not a security guarantee. Unsupported: IPv6, raw SSH/IIS/Windows log parsing, live collection, user accounts, persistent storage, automated blocking and production SIEM operations.

## Architecture

| Component | Purpose |
| --- | --- |
| `loglens/engine.py` | Python reference parser, rules and CSV report |
| `app.py` | Streamlit UI with pandas aggregation |
| `dist/engine.js` | Browser implementation of the same analysis contract |
| `dist/app.js` | Local file handling, display, filtering, evidence navigation, export |
| `loglens/experiment.py`, `dist/experiment.js` | Isolated R3 sample transformation and analysis |
| `dist/index.html`, `dist/styles.css` | Responsive and keyboard-accessible working UI |
| `tests/` | Python rules, Streamlit component test and Node tests |
| `scripts/check-parity.mjs` | Cross-language checks on shared fixtures |
| `.github/workflows/ci.yml` | Runs validation on push and pull request |

The analysis is implemented twice to keep the learning-focused Python app while providing a deployable browser-only demo. Parity checks are required when changing rules. This extra maintenance cost is deliberate. The visual charts use different bin sizes (web: up to 24 adaptive buckets; Python: 5-minute buckets); their underlying event counts and findings agree.

## Tests

Node.js 22 is needed for the browser-engine tests; no npm packages are required.

```bash
python -m unittest discover -s tests -v
python scripts/package_source.py
node --test tests/web.test.mjs
node scripts/check-parity.mjs
node --check dist/app.js
node --check dist/engine.js
```

Coverage includes exact time-window boundaries, distinct-account counting, successful-login resets, timezone normalization, duplicate suppression, malformed CSV, formula-safe exports, a 20,000-record input, expected demo results and Streamlit filtering. The status badge above links to the actual GitHub Actions runs. Local verification alone does not establish a passing GitHub run. No visual browser QA was run in this delivery.

## Demo hosting

The linked Sites demo is publicly accessible. To host your own copy, generate the source bundle and publish the `dist/` directory with a static host. GitHub Pages serves the browser demo, not the Python app.

Generated `dist/download/` bundles are intentionally ignored by Git. The CI workflow creates a fresh bundle before validating local asset links. The repository never includes Sites account identifiers or access credentials.

## Attribution

A rule-based log analysis project by Büşra Buse Uçar. The learning checklist covers the analysis rules, validation and regression tests. The rule implementations here are original project code. [Loglizer](https://github.com/logpai/loglizer) was an idea/reference resource; its ML implementation is not embedded in this project.

MIT licensed; see [LICENSE](LICENSE). Dependencies retain their respective licenses.
