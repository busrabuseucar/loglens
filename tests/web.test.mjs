import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseCsv, analyze, reportCsv, timeline, MAX_ROWS} from '../dist/engine.js';
import {runR3Experiment} from '../dist/experiment.js';

const header='timestamp,ip,username,status,source\n';
const record=(second,user='alice',status='failure',ip='192.0.2.1')=>`${new Date(Date.UTC(2026,8,4,9)+second*1000).toISOString()},${ip},${user},${status},vpn`;
const result=rows=>analyze(parseCsv(header+rows.join('\n')).events);

test('synthetic demo produces the documented findings and evidence',()=>{
  const parsed=parseCsv(readFileSync('dist/sample.csv','utf8'));
  const r=analyze(parsed.events);
  assert.deepEqual(r.summary,{total:161,success:133,failure:28,ips:15,users:16,flaggedIps:3});
  assert.deepEqual(r.alerts.map(a=>[a.rule,a.count]),[['R2',6],['R3',4],['R1',7],['R1',5]]);
  assert.equal(timeline(parsed.events).reduce((n,b)=>n+b.success+b.failure,0),161);
});

test('five-minute boundary includes exact endpoint, excludes one millisecond later',()=>{
  assert.equal(result([0,60,120,180,300].map(s=>record(s))).alerts.length,1);
  assert.equal(result([0,60,120,180,300.001].map(s=>record(s))).alerts.length,0);
});

test('spray rule counts distinct accounts, and R3 requires matching IP/account',()=>{
  assert.deepEqual(result([0,150,300,450,600].map((s,i)=>record(s,'u'+i))).alerts.map(a=>a.rule),['R2']);
  const failures=[0,30,60].map(s=>record(s));
  assert.equal(result([...failures,record(100,'bob','success')]).alerts.length,0);
  assert.equal(result([...failures,record(100,'alice','success','192.0.2.2')]).alerts.length,0);
  assert.deepEqual(result([...failures,record(100,'alice','success')]).alerts.map(a=>a.rule),['R3']);
});

test('prior successful login resets the R3 counter',()=>{
  assert.equal(result([record(0),record(10),record(20,'alice','success'),record(30),record(40,'alice','success')]).alerts.length,0);
});

test('CSV validation handles quoted fields, BOM, duplicate timezone-equivalent records',()=>{
  const csv='\ufefftimestamp;ip;username;status;source\r\n2026-09-04T09:00:00.001Z;192.0.2.1;"a,b";failure;"v""pn"\r\n2026-09-04T12:00:00.001+03:00;192.0.2.1;"a,b";failure;"v""pn"\r\n';
  const p=parseCsv(csv);assert.equal(p.duplicates,1);assert.equal(p.events[0].username,'a,b');assert.equal(p.events[0].source,'v"pn');assert.equal(p.events[0].ms%1000,1);
  assert.throws(()=>parseCsv(header+'"unclosed'),/tırnak/);
  assert.throws(()=>parseCsv('ip,username\n'),/Eksik sütun/);
  assert.equal(parseCsv(header+'2026-02-30T00:00:00Z,192.0.2.1,a,failure,vpn').errors.length,1);
});

test('duplicate failures cannot inflate a finding',()=>{
  const p=parseCsv(header+Array(6).fill(record(0)).join('\n'));
  assert.equal(p.duplicates,5);assert.equal(analyze(p.events).alerts.length,0);
});

test('report export protects spreadsheet formulas',()=>{
  const r=result([0,30,60].map(s=>record(s,'=1+1')).concat(record(90,'=1+1','success')));
  assert.match(reportCsv(r.alerts),/,'=1\+1,/);
});

test('accepts 20,000 records and rejects excess rows and bytes',()=>{
  const csv=header+Array.from({length:MAX_ROWS},(_,i)=>record(i)).join('\n');
  const p=parseCsv(csv);assert.equal(p.events.length,MAX_ROWS);
  assert.equal(analyze(p.events).alerts[0].count,301);
  assert.throws(()=>parseCsv(csv+'\n'+record(MAX_ROWS)),/20.000/);
  assert.throws(()=>parseCsv('x'.repeat(2*1024*1024+1)),/2 MB/);
});

test('HTML links and application element ids point to actual local resources',()=>{
  const html=readFileSync('dist/index.html','utf8'),app=readFileSync('dist/app.js','utf8');
  const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]);
  assert.equal(new Set(ids).size,ids.length,'duplicate DOM id');
  for(const [,id] of app.matchAll(/\$\('([^']+)'\)/g))assert.ok(ids.includes(id),`missing DOM id: ${id}`);
  for(const [,path] of html.matchAll(/(?:src|href)="\.\/([^"#]+)"/g))assert.ok(readFileSync('dist/'+path).length,`missing asset: ${path}`);
  assert.ok(!html.includes('http://')&&!html.includes('https://'),'demo must not load external resources');
});

test('R3 lesson distinguishes the inclusive boundary from one second later',()=>{
  const sample=readFileSync('dist/sample.csv','utf8');
  const atBoundary=runR3Experiment(sample,300),outside=runR3Experiment(sample,301);
  assert.equal(atBoundary.active,true);assert.deepEqual(atBoundary.inWindowRows,[118,119,121]);
  assert.equal(outside.active,false);assert.deepEqual(outside.inWindowRows,[119,121]);
  assert.equal(atBoundary.findings,4);assert.equal(outside.findings,3);
});

test('downloaded experiment CSV reproduces results without changing original sample',()=>{
  const sample=readFileSync('dist/sample.csv','utf8');
  for(const [seconds,expected] of [[160,4],[600,3]]){
    const exp=runR3Experiment(sample,seconds),p=parseCsv(exp.csv);
    assert.equal(p.events.length,161);assert.equal(p.errors.length,0);assert.equal(analyze(p.events).alerts.length,expected);
  }
  assert.equal(analyze(parseCsv(sample).events).alerts.length,4);
  for(const invalid of [159,601,300.5,'300',true])assert.throws(()=>runR3Experiment(sample,invalid));
});
