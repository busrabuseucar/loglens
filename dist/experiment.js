import {analyze, parseCsv, csvCell} from './engine.js';

/** Isolated lesson using the bundled synthetic sample, never a user's uploaded data. */
export function runR3Experiment(sampleCsv, elapsedSeconds = 160) {
  if (!Number.isInteger(elapsedSeconds) || elapsedSeconds < 160 || elapsedSeconds > 600) {
    throw new Error('Deney süresi 160–600 saniye arasında tam sayı olmalı.');
  }
  const original = parseCsv(sampleCsv).events;
  const scenario = original.filter(e => e.ip === '198.51.100.77' && e.username === 'demo_analyst');
  const failures = scenario.filter(e => e.status === 'failure'), successes = scenario.filter(e => e.status === 'success');
  if (failures.length !== 3 || successes.length !== 1) throw new Error('Deney için gereken dört örnek kayıt bulunamadı.');
  const successMs = failures[0].ms + elapsedSeconds * 1000;
  const target = successes[0];
  const events = original.map(e => e === target ? {...e, ms: successMs, timestamp: new Date(successMs).toISOString()} : {...e});
  const result = analyze(events), baseline = analyze(original);
  const evidence = events.filter(e => scenario.some(s => s.row === e.row));
  const inWindowRows = evidence.filter(e => e.status === 'failure' && e.ms <= successMs && successMs - e.ms <= 300000).map(e => e.row);
  const active = result.alerts.some(a => a.rule === 'R3' && a.ip === target.ip && a.username === target.username);
  const csv = [['timestamp','ip','username','status','source'], ...events.sort((a,b) => a.ms-b.ms || a.row-b.row).map(e => [e.timestamp,e.ip,e.username,e.status,e.source])]
    .map(row => row.map(csvCell).join(',')).join('\n') + '\n';
  return {elapsedSeconds, active, successTimestamp: new Date(successMs).toISOString(),
    windowStart: new Date(successMs - 300000).toISOString(), inWindowRows,
    baselineFindings: baseline.alerts.length, findings: result.alerts.length, evidence, csv};
}
