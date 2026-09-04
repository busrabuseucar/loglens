import {parseCsv, analyze, reportCsv, RULES, timeline, MAX_BYTES} from './engine.js';
import {runR3Experiment} from './experiment.js';

const $ = id => document.getElementById(id);
const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number = value => new Intl.NumberFormat('tr-TR').format(value);
const clock = iso => new Date(iso).toLocaleTimeString('tr-TR', {timeZone:'UTC', hour:'2-digit', minute:'2-digit', second:'2-digit'});
const day = iso => new Date(iso).toLocaleDateString('tr-TR', {timeZone:'UTC', day:'2-digit', month:'short', year:'numeric'});
const dateTime = iso => `${day(iso)} ${clock(iso)}`;
const state = {parsed:null, result:null, view:'overview', page:1, evidence:null, selected:null, busy:false, filename:'', sampleText:null, experiment:null};
let notificationTimer;

function notify(message, error = false) {
  clearTimeout(notificationTimer);
  const box = $('notification'); box.textContent = message; box.classList.toggle('error', error); box.hidden = false;
  if (!error) notificationTimer = setTimeout(() => {box.hidden = true;}, 5500);
}

function view(name) {
  state.view = name;
  for (const id of ['overview','events','rules','experiment']) $(id).hidden = id !== name;
  document.querySelectorAll('nav [data-view]').forEach(button => {
    button.classList.toggle('active', button.dataset.view === name);
    button.setAttribute('aria-pressed', String(button.dataset.view === name));
  });
  const labels = {overview:['Genel bakış','Giriş kaydı analizi','Şüpheli hareketleri bul. Her bulgunun nedenini gör.'],events:['Giriş kayıtları','Kayıtların içine bak','Her bulguyu zaman, IP adresi ve hesap düzeyinde incele.'],rules:['Analiz kuralları','Her bulgunun bir nedeni var','Eşikler, veri formatı ve analizin sınırları.'],experiment:['R3 deneyi','Bir saniye neyi değiştirir?','Başarılı girişin zamanını değiştir, uyarının nasıl değiştiğini gör.']};
  $('breadcrumb').textContent = labels[name][0]; $('page-title').textContent = labels[name][1]; $('page-description').textContent = labels[name][2];
  if (name === 'events') renderEvents();
  if (name === 'overview') renderChart();
  $('dropzone').hidden = name === 'experiment';
  document.querySelector('.heading-actions').hidden = name === 'experiment';
  if (state.parsed) renderQuality();
  if (name === 'experiment') {$('quality').hidden = true; renderExperiment();}
}

function filteredAlerts() {
  const search = $('alert-search').value.trim().toLowerCase();
  return (state.result?.alerts || []).filter(a => ($('severity-filter').value === 'all' || a.severity === $('severity-filter').value) && ($('rule-filter').value === 'all' || a.rule === $('rule-filter').value) && (!search || `${a.ip} ${a.users.join(' ')}`.toLowerCase().includes(search)));
}

function renderStats() {
  const s = state.result?.summary || {total:0,success:0,failure:0,ips:0,flaggedIps:0};
  const count = state.result?.alerts.length || 0;
  const entries = [
    ['Toplam kayıt',s.total,`${number(s.ips)} benzersiz IP adresi`,'≡'],
    ['Başarısız giriş',s.failure,s.total ? `%${(100*s.failure/s.total).toLocaleString('tr-TR',{maximumFractionDigits:1})} başarısız giriş oranı` : 'Kayıt bekleniyor','↘'],
    ['İncelenecek IP',s.flaggedIps,`${number(s.ips)} IP adresinin ${number(s.flaggedIps)} tanesi`,'⌕'],
    ['Toplam bulgu',count,`${state.result?.alerts.filter(a=>a.severity==='high').length || 0} yüksek · ${state.result?.alerts.filter(a=>a.severity==='medium').length || 0} orta önem`,'⌁'],
  ];
  $('stats').innerHTML = entries.map(([label,value,note,icon])=>`<article class="stat"><div class="stat-label">${label}<span class="stat-icon" aria-hidden="true">${icon}</span></div><div class="stat-value">${number(value)}</div><div class="stat-note">${note}</div></article>`).join('');
  $('nav-count').textContent = number(s.total);
  $('rule-counts').innerHTML = Object.entries(RULES).map(([id,rule])=>`<div class="rule-row"><span class="rule-symbol">${id}</span><div><strong>${rule.short}</strong><small>${id==='R1'?'5 dk · 5 başarısız giriş':id==='R2'?'10 dk · 5 farklı hesap':'5 dk · 3 hata + başarı'}</small></div><span class="rule-total">${state.result?.alerts.filter(a=>a.rule===id).length || 0}</span></div>`).join('');
}

function renderChart() {
  const events = state.parsed?.events || [], bins = timeline(events);
  if (!bins.length) {$('chart').innerHTML='<div class="empty"><strong>Henüz giriş kaydı yok.</strong>Örnek veriyi yükleyerek analizi deneyebilirsin.</div>'; $('chart-range').textContent='—'; return;}
  const W=Math.max(280,$('chart').clientWidth-38),H=185,left=32,right=8,top=15,bottom=30,plotH=H-top-bottom,plotW=W-left-right;
  const max=Math.max(4,...bins.map(b=>b.success+b.failure));
  const ceiling=Math.ceil(max/4)*4, step=plotW/bins.length,barW=Math.min(18,step*.65);
  const grid=Array.from({length:5},(_,i)=>{const v=ceiling*i/4,y=H-bottom-v/ceiling*plotH;return `<line x1="${left}" y1="${y}" x2="${W-right}" y2="${y}" stroke="#e9eef3" stroke-dasharray="3 4"/><text x="${left-9}" y="${y+4}" text-anchor="end">${v}</text>`;}).join('');
  const bars=bins.map((b,i)=>{const x=left+i*step+(step-barW)/2,good=b.success/ceiling*plotH,bad=b.failure/ceiling*plotH;return `<g><title>${clock(b.ms)} UTC: ${b.success} başarılı, ${b.failure} başarısız</title><rect x="${x}" y="${H-bottom-good}" width="${barW}" height="${good}" rx="2" fill="#49b19a"/><rect x="${x}" y="${H-bottom-good-bad}" width="${barW}" height="${bad}" rx="2" fill="#e88976"/></g>`;}).join('');
  const labels=[...new Set([0,Math.floor((bins.length-1)/3),Math.floor(2*(bins.length-1)/3),bins.length-1])].map(i=>`<text x="${left+i*step+step/2}" y="${H-6}" text-anchor="middle">${clock(bins[i].ms).slice(0,5)}</text>`).join('');
  $('chart').innerHTML=`<svg role="img" aria-labelledby="chart-title chart-desc" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><title id="chart-title">Giriş kayıtlarının zamana göre dağılımı</title><desc id="chart-desc">${number(state.result.summary.success)} başarılı ve ${number(state.result.summary.failure)} başarısız giriş. Ayrıntılı kayıtlar Giriş kayıtları bölümünde.</desc>${grid}${bars}${labels}</svg>`;
  $('chart-range').textContent=`${day(events[0].timestamp)} · ${clock(events[0].timestamp).slice(0,5)}–${clock(events.at(-1).timestamp).slice(0,5)}`;
}

function renderFindings() {
  const alerts=filteredAlerts(),total=state.result?.alerts.length || 0;
  $('alert-count').textContent=number(total); $('export').disabled=!alerts.length;
  $('filter-count').textContent=`${number(total)} bulgunun ${number(alerts.length)} tanesi gösteriliyor`;
  if (!alerts.length) {
    $('findings').innerHTML=`<div class="empty"><div class="empty-symbol" aria-hidden="true">◇</div><strong>${total?'Filtrelerle eşleşen bulgu yok.':state.parsed?'Bu kuralları tetikleyen kayıt yok.':'Analize başlamak için kayıt yükle.'}</strong>${total?'Aramayı veya filtreleri değiştirebilirsin.':state.parsed?'Bu sonuç güvenlik garantisi değildir.':'Örnek veride üç farklı şüpheli hareket senaryosu var.'}</div>`;return;
  }
  $('findings').innerHTML=`<table><thead><tr><th>Önem</th><th>Bulgu</th><th>IP adresi</th><th>Kayıt</th><th>Başlangıç · UTC</th><th><span class="sr-only">Detay</span></th></tr></thead><tbody>${alerts.map(a=>`<tr><td><span class="badge ${a.severity}">${a.severity==='high'?'Yüksek':'Orta'}</span></td><td class="finding-name">${RULES[a.rule].name}<small>${a.rule} · ${a.users.length} hesap</small></td><td class="mono">${esc(a.ip)}</td><td class="mono">${a.count}</td><td class="mono">${day(a.start)}<br>${clock(a.start)}</td><td><button class="detail-button" data-alert="${esc(a.id)}" aria-label="${esc(a.ip)} için ${RULES[a.rule].name} detayını aç">↗</button></td></tr>`).join('')}</tbody></table>`;
}

function renderEvents() {
  const q=$('event-search').value.trim().toLowerCase(),status=$('status-filter').value;
  const records=(state.parsed?.events || []).filter(e=>(!state.evidence || state.evidence.has(e.row)) && (status==='all'||status===e.status) && (!q || `${e.ip} ${e.username} ${e.source}`.toLowerCase().includes(q)));
  const pages=Math.max(1,Math.ceil(records.length/15)); state.page=Math.max(1,Math.min(state.page,pages));
  const shown=records.slice((state.page-1)*15,state.page*15);
  $('clear-evidence').hidden=!state.evidence;
  $('event-summary').textContent=state.evidence?'Seçili bulgunun kaynak kayıtları':`${number(records.length)} kayıt`;
  $('page-info').textContent=`${number(records.length)} kayıt · Sayfa ${state.page} / ${pages}`;
  $('prev-page').disabled=state.page<=1; $('next-page').disabled=state.page>=pages;
  $('events-table').innerHTML=shown.length?`<table><thead><tr><th>CSV kayıt no.</th><th>Zaman · UTC</th><th>IP adresi</th><th>Hesap</th><th>Sonuç</th><th>Kaynak</th></tr></thead><tbody>${shown.map(e=>`<tr><td class="mono muted">${e.row}</td><td class="mono">${day(e.timestamp)}<br>${clock(e.timestamp)}</td><td class="mono">${esc(e.ip)}</td><td class="mono">${esc(e.username)}</td><td><span class="badge ${e.status}">${e.status==='success'?'Başarılı':'Başarısız'}</span></td><td>${esc(e.source)}</td></tr>`).join('')}</tbody></table>`:'<div class="empty"><strong>Eşleşen kayıt yok.</strong>Dosya yükle veya arama ölçütlerini değiştir.</div>';
}

function detail(id) {
  const a=state.result.alerts.find(x=>x.id===id); if(!a)return;
  state.selected=a; $('detail-rule').textContent=`${a.rule} / KAYIT KANITI`;
  $('experiment-open').hidden = a.rule !== 'R3';
  const why=a.rule==='R1'?`Aynı IP adresinden 5 dakikalık pencere içinde ${a.count} başarısız giriş var.`:a.rule==='R2'?`Aynı IP adresinden 10 dakikalık pencere içinde ${a.users.length} farklı hesaba başarısız giriş var.`:`${a.score} başarısız denemenin ardından aynı IP ve hesapta başarılı giriş var. Bu kayıtlar 5 dakikalık pencere içinde.`;
  $('detail-content').innerHTML=`<span class="badge ${a.severity}">${a.severity==='high'?'Yüksek':'Orta'} önem</span><h2 id="detail-title">${RULES[a.rule].name}</h2><div class="explanation"><p>${why}</p></div><dl class="detail-facts"><div><dt>IP ADRESİ</dt><dd>${esc(a.ip)}</dd></div><div><dt>KAYIT / HESAP</dt><dd>${a.count} / ${a.users.length}</dd></div><div><dt>BAŞLANGIÇ · UTC</dt><dd>${dateTime(a.start)}</dd></div><div><dt>BİTİŞ · UTC</dt><dd>${dateTime(a.end)}</dd></div></dl><p><strong>İlgili hesaplar:</strong> ${a.users.slice(0,15).map(esc).join(', ')}${a.users.length>15?' …':''}</p><p>Bu bulgu inceleme önceliği gösterir. Paylaşılan ağlar veya hatırlanmayan parolalar da aynı davranışı oluşturabilir.</p>`;
  $('detail-dialog').showModal();
}

function renderQuality() {
  const {errors,duplicates}=state.parsed;
  $('quality').hidden=!errors.length&&!duplicates;
  $('quality').innerHTML=`${duplicates?`${number(duplicates)} tekrar kayıt bir kez sayıldı. `:''}${errors.length?`<details><summary>${number(errors.length)} hatalı kayıt analize alınmadı. Gerekçeleri göster</summary><ul>${errors.slice(0,30).map(e=>`<li>CSV kayıt ${e.row}: ${esc(e.reason)}</li>`).join('')}</ul>${errors.length>30?`<p>İlk 30 hata gösteriliyor; toplam ${number(errors.length)} hatalı kayıt var.</p>`:''}</details>`:''}`;
}

function useCsv(text, filename, sample = false) {
  const parsed=parseCsv(text);
  if (!parsed.events.length) throw new Error(parsed.errors.length?`Geçerli kayıt bulunamadı. İlk hata (kayıt ${parsed.errors[0].row}): ${parsed.errors[0].reason}`:'Dosyada veri kaydı yok. Şablonu doldur veya örnek veriyi yükle.');
  const result=analyze(parsed.events);
  state.parsed=parsed;state.result=result;state.filename=filename;state.evidence=null;state.page=1;
  $('alert-search').value='';$('severity-filter').value='all';$('rule-filter').value='all';$('event-search').value='';$('status-filter').value='all';
  $('dataset-name').textContent=filename;
  $('dataset-meta').textContent=`${number(parsed.events.length)} geçerli kayıt · ${day(parsed.events[0].timestamp)} · ${sample?'Örnek senaryo':'Dosya tarayıcıda işlendi'}`;
  $('sample-badge').hidden=!sample;
  renderStats();renderChart();renderFindings();renderEvents();renderQuality();
}

async function busy(action) {
  if(state.busy)return;state.busy=true;$('upload').disabled=true;$('load-sample').disabled=true;$('main').setAttribute('aria-busy','true');
  try {await action();}
  catch(error) {notify(error.message+(state.parsed?' Önceki analiz korunuyor.':''),true);}
  finally {state.busy=false;$('upload').disabled=false;$('load-sample').disabled=false;$('main').removeAttribute('aria-busy');}
}

async function loadSample(announce=true) {
  await busy(async()=>{const response=await fetch('./sample.csv');if(!response.ok)throw new Error('Örnek veri yüklenemedi. CSV yükleyerek devam edebilirsin.');state.sampleText=await response.text();useCsv(state.sampleText,'sample.csv',true);renderExperiment();if(announce)notify('Örnek veri yüklendi. 161 sentetik kayıt üç kuralla analiz edildi.');});
}
async function loadFile(file) {
  if(!file)return;
  await busy(async()=>{if(file.size>MAX_BYTES)throw new Error('Dosya en fazla 2 MB olabilir.');
    if(!file.name.toLowerCase().endsWith('.csv'))throw new Error('Lütfen .csv uzantılı bir dosya seç.');
    let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(await file.arrayBuffer());}catch{throw new Error('Dosya UTF-8 kodlamalı olmalı.');}
    useCsv(text,file.name);notify(`${number(state.parsed.events.length)} kayıt analiz edildi. ${state.result.alerts.length} bulgu var.`);
  });$('file-input').value='';
}

function renderExperiment() {
  const seconds=Number($('experiment-delay').value);
  const duration=`${Math.floor(seconds/60)} dk ${seconds%60} sn`;
  $('experiment-duration').textContent=duration;
  $('experiment-delay').setAttribute('aria-valuetext',duration);
  document.querySelectorAll('[data-delay]').forEach(button=>button.setAttribute('aria-pressed',String(Number(button.dataset.delay)===seconds)));
  if(!state.sampleText){$('experiment-explanation').textContent=state.busy?'Örnek kayıtlar yükleniyor.':'Örnek veri yüklenemedi. Genel bakıştan örnek veriyi yeniden yükleyebilirsin.';return;}
  const exp=runR3Experiment(state.sampleText,seconds);state.experiment=exp;
  $('experiment-success-time').textContent=clock(exp.successTimestamp);
  $('experiment-badge').textContent=exp.active?'R3 uyarısı var':'R3 uyarısı yok';
  $('experiment-badge').className=`badge ${exp.active?'high':'excluded'}`;
  document.querySelector('.experiment-result').classList.toggle('inactive',!exp.active);
  $('experiment-failures').textContent=`${exp.inWindowRows.length} / 3`;
  $('experiment-total').textContent=`${exp.baselineFindings} → ${exp.findings}`;
  $('experiment-explanation').textContent=exp.active?(seconds===300?'Tam 5 dakika: ilk hata sınırın üzerinde ve hâlâ dahil. Üç hata da sayıldığı için R3 uyarısı devam ediyor.':'Üç başarısız giriş de başarıdan önceki 5 dakika içinde. Aynı IP ve hesap koşulu da sağlandığı için R3 uyarısı oluşuyor.'):`Başarıdan önceki 5 dakikada ${exp.inWindowRows.length} başarısız giriş kaldı. R3 için en az 3 gerekiyor; bu yüzden uyarı oluşmuyor.`;
  $('experiment-window').textContent=`İncelenen pencere: ${clock(exp.windowStart)}–${clock(exp.successTimestamp)} UTC · iki sınır da dahil`;
  const successMs=Date.parse(exp.successTimestamp);
  $('experiment-records').innerHTML=`<table><thead><tr><th>Olay</th><th>Saat · UTC</th><th>Başarıya uzaklık</th><th>Penceredeki durumu</th></tr></thead><tbody>${exp.evidence.map((e,i)=>{const included=exp.inWindowRows.includes(e.row),isSuccess=e.status==='success';const age=Math.round((successMs-e.ms)/1000);return `<tr class="${isSuccess?'experiment-record-success':included?'':'experiment-record-out'}"><td>${isSuccess?'Başarılı giriş':`${i+1}. başarısız giriş`}</td><td class="mono">${clock(e.timestamp)}</td><td class="mono">${isSuccess?'—':`${Math.floor(age/60)} dk ${age%60} sn`}</td><td><span class="badge ${isSuccess?'success':included?'medium':'excluded'}">${isSuccess?'Pencerenin sonu':included?'Dahil':'Pencere dışında'}</span></td></tr>`;}).join('')}</tbody></table>`;
  $('experiment-download').disabled=false;
}

function downloadCsv(text,filename) {
  const blob=new Blob(['\ufeff'+text],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}

document.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',()=>view(button.dataset.view)));
$('upload').addEventListener('click',()=>$('file-input').click());
$('file-input').addEventListener('change',event=>loadFile(event.target.files[0]));
$('load-sample').addEventListener('click',()=>loadSample());
for(const id of ['alert-search','severity-filter','rule-filter'])$(id).addEventListener(id==='alert-search'?'input':'change',renderFindings);
for(const id of ['event-search','status-filter'])$(id).addEventListener(id==='event-search'?'input':'change',()=>{state.page=1;renderEvents();});
$('findings').addEventListener('click',event=>{const button=event.target.closest('[data-alert]');if(button)detail(button.dataset.alert);});
for(const id of ['close-dialog','close-dialog-bottom'])$(id).addEventListener('click',()=>$('detail-dialog').close());
$('detail-dialog').addEventListener('click',event=>{if(event.target===$('detail-dialog')){const r=event.target.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)event.target.close();}});
$('evidence-button').addEventListener('click',()=>{state.evidence=new Set(state.selected.rows);state.page=1;$('event-search').value='';$('status-filter').value='all';$('detail-dialog').close();view('events');$('main').focus();});
$('experiment-open').addEventListener('click',()=>{$('detail-dialog').close();view('experiment');$('main').focus();});
$('experiment-delay').addEventListener('input',renderExperiment);
document.querySelectorAll('[data-delay]').forEach(button=>button.addEventListener('click',()=>{$('experiment-delay').value=button.dataset.delay;renderExperiment();}));
$('experiment-download').addEventListener('click',()=>{if(state.experiment){downloadCsv(state.experiment.csv,`loglens-r3-${state.experiment.elapsedSeconds}s.csv`);notify('Deneyin 161 kaydı indirildi. Genel bakışta CSV yükle ile yeniden analiz edebilirsin.');}});
$('clear-evidence').addEventListener('click',()=>{state.evidence=null;state.page=1;renderEvents();});
$('prev-page').addEventListener('click',()=>{state.page--;renderEvents();});
$('next-page').addEventListener('click',()=>{state.page++;renderEvents();});
$('export').addEventListener('click',()=>{const list=filteredAlerts();if(!list.length)return;downloadCsv(reportCsv(list),'loglens-findings.csv');notify(`${list.length} görünür bulgu CSV olarak indirildi.`);});
$('dropzone').addEventListener('dragover',event=>{event.preventDefault();$('dropzone').classList.add('dragging');});
$('dropzone').addEventListener('dragleave',()=>$('dropzone').classList.remove('dragging'));
$('dropzone').addEventListener('drop',event=>{event.preventDefault();$('dropzone').classList.remove('dragging');loadFile(event.dataTransfer.files[0]);});
$('rules-grid').innerHTML=Object.entries(RULES).map(([id,rule])=>`<article class="rule-card"><header><span class="rule-symbol">${id}</span><span class="badge ${rule.severity}">${rule.severity==='high'?'Yüksek':'Orta'} önem</span></header><h3>${rule.name}</h3><p>${rule.description}</p><div class="threshold">${rule.threshold}</div></article>`).join('');
renderStats();renderChart();renderFindings();renderEvents();
let resizeTimer;
window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{if(state.view==='overview')renderChart();},120);});
loadSample(false);
