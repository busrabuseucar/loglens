/** Browser implementation of the documented LogLens rules. No network access. */
export const MAX_BYTES = 2 * 1024 * 1024;
export const MAX_ROWS = 20000;
export const RULES = {
  R1: {name: 'Yoğun başarısız giriş', short: 'Başarısız giriş', threshold: '5 dakikada ≥ 5 başarısız giriş', description: 'Aynı IPv4 adresinden 5 dakika içinde en az 5 başarısız giriş. Hesaplar farklı olabilir.', severity: 'medium'},
  R2: {name: 'Çoklu hesap denemesi', short: 'Çoklu hesap', threshold: '10 dakikada ≥ 5 farklı hesap', description: 'Aynı IPv4 adresinden 10 dakika içinde en az 5 farklı hesaba başarısız giriş. Parola püskürtme belirtisi olabilir.', severity: 'high'},
  R3: {name: 'Hatalardan sonra başarılı giriş', short: 'Başarıya dönüş', threshold: '5 dakikada ≥ 3 hata → başarı', description: 'Aynı IP ve hesapta, son başarılı girişten sonra 5 dakika içinde en az 3 başarısız denemeyi izleyen başarı.', severity: 'high'},
};

function csvRows(text, delimiter) {
  const rows = []; let row = [], field = '', quoted = false, afterQuote = false, start = true;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {field += '"'; i++;}
        else {quoted = false; afterQuote = true;}
      } else field += c;
    } else if (c === '"') {
      if (!start) throw new Error('CSV tırnak yapısı geçersiz.');
      quoted = true; start = false;
    } else if (c === delimiter) {
      row.push(field); field = ''; afterQuote = false; start = true;
    } else if (c === '\n' || c === '\r') {
      row.push(field); rows.push(row); row = []; field = ''; afterQuote = false; start = true;
      if (c === '\r' && text[i + 1] === '\n') i++;
    } else {
      if (afterQuote) throw new Error('CSV tırnak yapısı geçersiz.');
      field += c; start = false;
    }
  }
  if (quoted) throw new Error('CSV içinde kapanmamış tırnak var.');
  if (field || row.length || afterQuote) {row.push(field); rows.push(row);}
  return rows;
}

function dateValue(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|([+-])(\d{2}):(\d{2}))$/.exec(value);
  if (!m) throw new Error('timestamp: saat dilimi içeren ISO 8601 gerekli');
  const [y, mo, d, h, mi, s] = m.slice(1, 7).map(Number);
  const base = new Date(Date.UTC(y, mo - 1, d, h, mi, s, Number((m[7] || '').padEnd(3, '0'))));
  if (y < 2000 || y > 2100 || mo < 1 || mo > 12 || base.getUTCFullYear() !== y || base.getUTCMonth() !== mo - 1 || base.getUTCDate() !== d || h > 23 || mi > 59 || s > 59 || Number(m[10] || 0) > 23 || Number(m[11] || 0) > 59) throw new Error('timestamp: geçersiz tarih veya saat');
  const offset = m[8] === 'Z' ? 0 : (Number(m[10]) * 60 + Number(m[11])) * (m[9] === '+' ? 1 : -1);
  const ms = base.getTime() - offset * 60000;
  return {timestamp: new Date(ms).toISOString(), ms};
}

export function parseCsv(text) {
  if (new TextEncoder().encode(text).length > MAX_BYTES) throw new Error('Dosya en fazla 2 MB olabilir.');
  text = text.replace(/^\uFEFF/, '');
  const first = text.split(/[\r\n]/)[0] || '';
  const delimiter = (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ';' : ',';
  const rows = csvRows(text, delimiter);
  if (!rows.length) throw new Error('CSV dosyası boş.');
  const headers = rows[0].map(x => x.trim().toLowerCase());
  if (new Set(headers).size !== headers.length) throw new Error('Tekrarlanan sütun adı var.');
  const missing = ['timestamp', 'ip', 'username', 'status'].filter(x => !headers.includes(x));
  if (missing.length) throw new Error('Eksik sütun: ' + missing.join(', '));
  if (rows.length - 1 > MAX_ROWS) throw new Error('En fazla 20.000 veri satırı yükleyebilirsin.');
  const events = [], errors = [], seen = new Set(); let duplicates = 0, total = 0;
  rows.slice(1).forEach((row, index) => {
    if (!row.some(x => x.trim())) return;
    total++;
    try {
      if (row.length !== headers.length) throw new Error('Sütun sayısı başlıkla uyuşmuyor');
      const record = Object.fromEntries(headers.map((key, i) => [key, row[i].trim()]));
      const date = dateValue(record.timestamp);
      if (!/^(0|[1-9]\d{0,2})(\.(0|[1-9]\d{0,2})){3}$/.test(record.ip) || record.ip.split('.').some(x => Number(x) > 255)) throw new Error('ip: geçerli IPv4 adresi gerekli');
      const username = record.username, source = record.source || '—', status = record.status.toLowerCase();
      if (!username || [...username].length > 128) throw new Error('username: 1–128 karakter gerekli');
      if ([...source].length > 128) throw new Error('source: en fazla 128 karakter olabilir');
      if (!['success', 'failure'].includes(status)) throw new Error('status: success veya failure olmalı');
      const key = JSON.stringify([date.timestamp, record.ip, username, status, source]);
      if (seen.has(key)) {duplicates++; return;}
      seen.add(key);
      events.push({...date, ip: record.ip, username, status, source, row: index + 2});
    } catch (error) {errors.push({row: index + 2, reason: error.message});}
  });
  events.sort((a, b) => a.ms - b.ms || a.row - b.row);
  return {events, errors, duplicates, total};
}

const compare = (a, b) => {
  if (typeof a !== 'string' || typeof b !== 'string') return a < b ? -1 : a > b ? 1 : 0;
  const aa = [...a], bb = [...b];
  for (let i = 0; i < Math.min(aa.length, bb.length); i++) {
    const d = aa[i].codePointAt(0) - bb[i].codePointAt(0); if (d) return d;
  }
  return aa.length - bb.length;
};

export function analyze(input) {
  const events = [...input].sort((a, b) => a.ms - b.ms || a.row - b.row);
  const failures = new Map(), alerts = [];
  for (const e of events) if (e.status === 'failure') {
    if (!failures.has(e.ip)) failures.set(e.ip, []);
    failures.get(e.ip).push(e);
  }
  const finding = (rule, ip, window, score, username = null) => ({
    id: `${rule}:${ip}${username !== null ? ':' + username : ''}`, rule, severity: RULES[rule].severity, ip, username,
    start: window[0].timestamp, end: window.at(-1).timestamp, count: window.length,
    users: [...new Set(window.map(e => e.username))].sort(compare), rows: window.map(e => e.row), score,
  });
  for (const [ip, group] of failures) {
    for (const [rule, minutes] of [['R1', 5], ['R2', 10]]) {
      let left = 0, best = null; const counts = new Map();
      group.forEach((event, right) => {
        counts.set(event.username, (counts.get(event.username) || 0) + 1);
        while (event.ms - group[left].ms > minutes * 60000) {
          const old = group[left++]; const n = counts.get(old.username) - 1;
          if (n) counts.set(old.username, n); else counts.delete(old.username);
        }
        const score = rule === 'R1' ? right - left + 1 : counts.size;
        if (score >= 5 && (!best || score > best.score)) best = {left, right, score};
      });
      if (best) alerts.push(finding(rule, ip, group.slice(best.left, best.right + 1), best.score));
    }
  }
  const pending = new Map(), strongest = new Map();
  for (const event of events) {
    const key = JSON.stringify([event.ip, event.username]);
    if (!pending.has(key)) pending.set(key, {events: [], left: 0});
    const q = pending.get(key);
    while (q.left < q.events.length && event.ms - q.events[q.left].ms > 300000) q.left++;
    if (event.status === 'failure') q.events.push(event);
    else {
      const score = q.events.length - q.left;
      if (score >= 3 && (!strongest.has(key) || score > strongest.get(key).score)) strongest.set(key, finding('R3', event.ip, [...q.events.slice(q.left), event], score, event.username));
      pending.delete(key);
    }
  }
  alerts.push(...strongest.values());
  alerts.sort((a, b) => compare(a.severity === 'high' ? 0 : 1, b.severity === 'high' ? 0 : 1) || compare(a.rule, b.rule) || compare(a.ip, b.ip) || compare(a.username || '', b.username || ''));
  return {alerts, summary: {total: events.length, success: events.filter(e => e.status === 'success').length,
    failure: events.filter(e => e.status === 'failure').length, ips: new Set(events.map(e => e.ip)).size,
    users: new Set(events.map(e => e.username)).size, flaggedIps: new Set(alerts.map(a => a.ip)).size}};
}

export function csvCell(value) {
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = "'" + text;
  return /[",\r\n]/.test(text) ? '"' + text.replaceAll('"', '""') + '"' : text;
}
export function reportCsv(alerts) {
  const rows = [['rule', 'severity', 'ip', 'username', 'start_utc', 'end_utc', 'event_count', 'users', 'csv_rows'],
    ...alerts.map(a => [a.rule, a.severity, a.ip, a.username || '', a.start, a.end, a.count, a.users.join(' | '), a.rows.join(' | ')])];
  return rows.map(row => row.map(csvCell).join(',')).join('\n') + '\n';
}

export function timeline(events, buckets = 24) {
  if (!events.length) return [];
  const start = Math.min(...events.map(e => e.ms)), end = Math.max(...events.map(e => e.ms));
  const width = Math.max(60000, Math.ceil((end - start + 1) / buckets));
  const out = Array.from({length: Math.min(buckets, Math.floor((end - start) / width) + 1)}, (_, i) => ({ms: start + i * width, success: 0, failure: 0}));
  for (const e of events) out[Math.min(out.length - 1, Math.floor((e.ms - start) / width))][e.status]++;
  return out;
}
