/** Verify the Python reference and browser engine on shared adversarial fixtures. */
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {parseCsv, analyze, reportCsv, csvCell} from '../dist/engine.js';
import {runR3Experiment} from '../dist/experiment.js';

const cases=[readFileSync('dist/sample.csv','utf8'),'timestamp,ip,username,status\n','ip,ip\n','timestamp,ip,username,status\n"unfinished'];
const header='timestamp,ip,username,status,source\n';
const encode=rows=>header+rows.map(r=>r.map(v=>/[",\n\r]/.test(v)?'"'+v.replaceAll('"','""')+'"':v).join(',')).join('\n');
let seed=42;
function random(){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;}
for(let set=0;set<35;set++){
  const rows=[];
  for(let i=0;i<150;i++){
    const seconds=Math.floor(random()*900),users=['alice','bob','çığ','"quoted"','=1+1','emoji_😀','private_\ue000'];
    const t=new Date(Date.UTC(2026,8,4,9)+seconds*1000+(i%7===0?1:0)).toISOString();
    rows.push([t,'192.0.2.'+Math.ceil(random()*3),users[Math.floor(random()*users.length)],random()>.2?'failure':'success',i%2?'vpn':'web']);
  }
  cases.push(encode(rows));
}
cases.push('\ufefftimestamp;ip;username;status;source\r\n2026-09-04T09:00:00Z;192.0.2.1;"A, B\nC";failure;"vp""n"\r\n');
cases.push(encode([['2026-09-04T09:00:00.001Z','192.0.2.1','a','failure','vpn'],['2026-09-04T12:00:00.001+03:00','192.0.2.1','a','failure','vpn']]));
cases.push(encode(['2026-02-30T09:00:00Z','2026-09-04T12:00:00+02:60','2026-09-04T24:00:00Z','2026-09-04T09:00:00.1234Z'].map(t=>[t,'192.0.2.1','a','failure','vpn'])));
const py=`import json,sys\nfrom loglens import parse_csv,analyze,report_csv\nout=[]\nfor text in json.load(sys.stdin):\n try:\n  p=parse_csv(text); r=analyze(p['events']); out.append({'events':p['events'],'duplicates':p['duplicates'],'total':p['total'],'errorRows':[e['row'] for e in p['errors']],'result':r,'csv':report_csv(r['alerts'])})\n except ValueError:\n  out.append({'rejected':True})\njson.dump(out,sys.stdout,ensure_ascii=False)\n`;
const proc=spawnSync(process.env.LOG_LENS_PYTHON||'python',['-c',py],{input:JSON.stringify(cases),encoding:'utf8',maxBuffer:20*1024*1024});
assert.equal(proc.status,0,proc.stderr);
const expected=JSON.parse(proc.stdout);
cases.forEach((text,i)=>{
  let actual;
  try{const p=parseCsv(text),r=analyze(p.events);actual={events:p.events,duplicates:p.duplicates,total:p.total,errorRows:p.errors.map(e=>e.row),result:r,csv:reportCsv(r.alerts)};}
  catch{actual={rejected:true};}
  assert.deepEqual(actual,expected[i],`Python/browser parity fixture ${i}`);
});
console.log(`PASS: ${cases.length} shared fixtures match, including normalized events, evidence, summaries and CSV reports.`);
const experimentDelays=[160,300,301,600],sample=readFileSync('dist/sample.csv','utf8');
const expPy="import sys,json\nfrom loglens.experiment import run_r3_experiment\nx=json.load(sys.stdin)\njson.dump([run_r3_experiment(x['sample'],d) for d in x['delays']],sys.stdout)\n";
const expProc=spawnSync(process.env.LOG_LENS_PYTHON||'python',['-c',expPy],{input:JSON.stringify({sample,delays:experimentDelays}),encoding:'utf8',maxBuffer:2*1024*1024});
assert.equal(expProc.status,0,expProc.stderr);
const expExpected=JSON.parse(expProc.stdout);
experimentDelays.forEach((delay,i)=>assert.deepEqual(runR3Experiment(sample,delay),expExpected[i],`R3 experiment ${delay}s`));
console.log('PASS: 4 R3 experiment presets match in Python and JavaScript, including downloadable CSV.');
