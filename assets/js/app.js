import { AI_PROFILES } from './config.js';
import { compileGlossary, findGlossaryMatches, groupGlossaryMatches, replaceGlossaryMatches } from './core/glossary-engine.js';
import { analyzeIdentifiers } from './core/identifier-engine.js';
import { extractTerms } from './core/term-extractor.js';
import { readDocument } from './core/file-reader.js';
import { exportWord, renderCategories, renderReportBar, reportText } from './core/report.js';
import { downloadBlob, escapeHtml } from './core/text-utils.js';
import { loadState, saveState } from './core/storage.js';
import { cancelSemantic, clusterSemantically } from './ai/semantic-client.js';

const $ = (id) => document.getElementById(id);
let state = loadState();
let currentReport = null;
let extraction = null;
let semanticGroups = null;

function persist(message = 'Glosarium tersimpan otomatis di browser.') {
  saveState(state);
  $('storageStatus').textContent = message;
}

function renderTerms() {
  $('termRows').innerHTML = state.terms.map((term, index) => `<div class="term-row"><button class="remove" data-remove="${index}" type="button">hapus ×</button><label>Istilah baku</label><input type="text" data-index="${index}" data-field="canonical" value="${escapeHtml(term.canonical)}" placeholder="mis. pengguna"><label>Varian yang dihindari</label><input type="text" data-index="${index}" data-field="variants" value="${escapeHtml(term.variants)}" placeholder="mis. user, klien, customer"></div>`).join('');
  $('ruleCount').textContent = `${state.terms.filter((x) => x.canonical.trim()).length} aturan`;
}

function setReport(report, extraHtml = '') {
  currentReport = report;
  $('results').innerHTML = renderReportBar() + renderCategories(report) + extraHtml;
}

function issueHtml(issues) {
  return issues.length ? `<div class="result-section"><div class="notice error"><strong>Aturan ambigu harus diperbaiki:</strong><br>${issues.map(escapeHtml).join('<br>')}</div></div>` : '';
}

function glossaryAnalysis() {
  const text = $('glossaryInput').value;
  const compiled = compileGlossary(state.terms, { caseSensitive: state.caseSensitive });
  if (!text.trim()) { $('results').innerHTML = '<div class="result-section"><div class="empty">Tempel naskah terlebih dahulu.</div></div>'; return null; }
  if (compiled.issues.length) { $('results').innerHTML = issueHtml(compiled.issues); return null; }
  if (!compiled.rules.length) { $('results').innerHTML = '<div class="result-section"><div class="empty">Belum ada aturan istilah yang valid.</div></div>'; return null; }
  const matches = findGlossaryMatches(text, compiled.rules);
  const groups = groupGlossaryMatches(matches);
  const report = { toolLabel: 'Cek Istilah', red: groups.map((g) => ({ text: `Ganti “${g.variant}” → “${g.canonical}”`, meta: `${g.count}×; ${g.locations.slice(0, 4).join(', ')}` })), blue: [] };
  let cursor = 0;
  const highlighted = matches.map((m) => {
    const before = escapeHtml(text.slice(cursor, m.start)); cursor = m.end;
    return `${before}<mark class="flag" title="Baris ${m.line}:${m.column} — gunakan ${escapeHtml(m.canonical)}">${escapeHtml(m.matched)}</mark>`;
  }).join('') + escapeHtml(text.slice(cursor));
  const rows = groups.map((g) => `<tr><td><span class="pill red">${g.count}×</span></td><td><span class="variant-tag">${escapeHtml(g.variant)}</span></td><td>→ <span class="canon-tag">${escapeHtml(g.canonical)}</span></td><td class="context">${escapeHtml(g.contexts[0] || '')}</td></tr>`).join('');
  setReport(report, `<div class="result-section"><div class="result-head"><h3>Naskah bertanda</h3><span class="tally">${matches.length} temuan</span></div><div class="manuscript">${highlighted}</div></div><div class="result-section"><div class="result-head"><h3>Rekap temuan</h3><span class="tally">${groups.length} varian</span></div>${groups.length ? `<table class="report"><thead><tr><th>Jumlah</th><th>Varian</th><th>Baku</th><th>Konteks</th></tr></thead><tbody>${rows}</tbody></table>` : '<div class="empty">Naskah konsisten.</div>'}</div>`);
  return { text, matches };
}

function renderExtraction() {
  const groups = semanticGroups || [];
  const report = {
    toolLabel: 'Ekstrak Istilah', red: [],
    blue: [
      ...extraction.variantGroups.map((group) => ({ text: `Variasi tulisan: ${group.map((x) => `${x.term}(${x.count})`).join(', ')}`, meta: `kandidat baku: ${group[0].term}` })),
      ...groups.map((group) => ({ text: `Kemungkinan sinonim: ${group.items.map((x) => x.term).join(', ')}`, meta: `confidence ${group.confidence.toFixed(2)}` })),
    ],
  };
  const candidateRows = extraction.candidates.map((x) => `<tr><td><span class="pill green">${x.count}×</span></td><td>${escapeHtml(x.term)}</td><td class="score">${x.score.toFixed(1)}</td><td><button class="btn ghost small" data-add-term="${escapeHtml(x.term)}">Tambah baku</button></td></tr>`).join('');
  const variantRows = extraction.variantGroups.map((group) => `<tr><td>${group.map((x) => `<span class="variant-tag">${escapeHtml(x.term)} ×${x.count}</span>`).join('')}</td><td><button class="btn ghost small" data-add-rule="${escapeHtml(encodeURIComponent(JSON.stringify(group.map((x) => x.term))))}">Tambah aturan</button></td></tr>`).join('');
  const semanticRows = groups.map((group) => `<tr><td>${group.items.map((x) => `<span class="variant-tag">${escapeHtml(x.term)} ×${x.count}</span>`).join('')}</td><td><span class="pill blue">${group.confidence.toFixed(2)}</span></td><td><button class="btn ghost small" data-add-rule="${escapeHtml(encodeURIComponent(JSON.stringify(group.items.map((x) => x.term))))}">Tambah aturan</button></td></tr>`).join('');
  setReport(report, `<div class="result-section"><div class="result-head"><h3>Kandidat istilah</h3><span class="tally">${extraction.candidates.length} kandidat</span></div>${candidateRows ? `<table class="report"><thead><tr><th>Freq.</th><th>Istilah/frasa</th><th>Skor</th><th></th></tr></thead><tbody>${candidateRows}</tbody></table>` : '<div class="empty">Tidak ada kandidat berulang.</div>'}</div><div class="result-section"><div class="result-head"><h3>Variasi penulisan konservatif</h3><span class="tally">${extraction.variantGroups.length} kelompok</span></div>${variantRows ? `<table class="report"><tbody>${variantRows}</tbody></table>` : '<div class="empty">Tidak ada variasi yang cukup kuat.</div>'}</div>${semanticGroups ? `<div class="result-section"><div class="result-head"><h3>Kelompok semantik AI</h3><span class="tally">${groups.length} kelompok</span></div>${semanticRows ? `<table class="report"><thead><tr><th>Istilah</th><th>Confidence</th><th></th></tr></thead><tbody>${semanticRows}</tbody></table>` : '<div class="empty">Tidak ada kelompok di atas ambang saat ini.</div>'}<p class="subtle">AI menghasilkan kandidat, bukan keputusan terminologis.</p></div>` : ''}`);
}

$('termRows').addEventListener('input', (event) => {
  const index = Number(event.target.dataset.index); const field = event.target.dataset.field;
  if (!Number.isInteger(index) || !field) return;
  state.terms[index][field] = event.target.value; persist(); $('ruleCount').textContent = `${state.terms.filter((x) => x.canonical.trim()).length} aturan`;
});
$('termRows').addEventListener('click', (event) => { const index = event.target.dataset.remove; if (index === undefined) return; state.terms.splice(Number(index), 1); renderTerms(); persist(); });
$('addTermBtn').addEventListener('click', () => { state.terms.push({ canonical: '', variants: '' }); renderTerms(); persist(); });
$('caseSensitive').checked = state.caseSensitive;
$('preserveCase').checked = state.preserveCase;
$('aiProfile').value = state.aiProfile;
$('semanticThreshold').value = state.threshold;
$('thresholdValue').value = Number(state.threshold).toFixed(2);
$('caseSensitive').addEventListener('change', (e) => { state.caseSensitive = e.target.checked; persist(); });
$('preserveCase').addEventListener('change', (e) => { state.preserveCase = e.target.checked; persist(); });
$('aiProfile').addEventListener('change', (e) => { state.aiProfile = e.target.value; state.threshold = AI_PROFILES[state.aiProfile].threshold; $('semanticThreshold').value = state.threshold; $('thresholdValue').value = state.threshold.toFixed(2); persist(); });
$('semanticThreshold').addEventListener('input', (e) => { state.threshold = Number(e.target.value); $('thresholdValue').value = state.threshold.toFixed(2); persist(); });

document.querySelectorAll('.tab-btn').forEach((button) => button.addEventListener('click', () => { document.querySelectorAll('.tab-btn').forEach((x) => x.classList.toggle('active', x === button)); document.querySelectorAll('.tab-panel').forEach((panel) => { panel.hidden = panel.id !== `tab-${button.dataset.tab}`; }); $('results').innerHTML = ''; currentReport = null; }));

$('checkGlossaryBtn').addEventListener('click', glossaryAnalysis);
$('fixGlossaryBtn').addEventListener('click', () => { const result = glossaryAnalysis(); if (!result) return; $('glossaryInput').value = replaceGlossaryMatches(result.text, result.matches, { preserveCase: state.preserveCase }); glossaryAnalysis(); });
$('checkIdentBtn').addEventListener('click', () => { const code = $('identInput').value; if (!code.trim()) { $('results').innerHTML = '<div class="result-section"><div class="empty">Tempel kode terlebih dahulu.</div></div>'; return; } const result = analyzeIdentifiers(code); const report = { toolLabel: 'Cek Penamaan Kode', red: [], blue: result.inconsistent.map((g) => ({ text: `${g.variants.map((v) => `${v.name}(${v.count})`).join(', ')}`, meta: `saran: ${g.suggested}` })) }; const rows = result.inconsistent.map((g) => `<tr><td>${g.variants.map((v) => `<span class="variant-tag">${escapeHtml(v.name)} ×${v.count}</span>`).join('')}</td><td><span class="canon-tag">${escapeHtml(g.suggested)}</span></td></tr>`).join(''); setReport(report, `<div class="result-section"><div class="result-head"><h3>Penamaan bercabang</h3><span class="tally">gaya dominan: ${escapeHtml(result.dominantStyle)}</span></div>${rows ? `<table class="report"><thead><tr><th>Variasi</th><th>Saran</th></tr></thead><tbody>${rows}</tbody></table>` : '<div class="empty">Tidak ada inkonsistensi yang terdeteksi.</div>'}<p class="subtle">Hasil ini heuristik lintas bahasa, bukan AST per bahasa. Nama kelas dan variabel dapat sengaja berbeda kapitalisasi.</p></div>`); });

$('documentInput').addEventListener('change', async (event) => { const file = event.target.files[0]; if (!file) return; $('documentStatus').textContent = `Membaca ${file.name}…`; try { const text = await readDocument(file); $('extractInput').value = text; $('documentStatus').textContent = `${file.name} berhasil dibaca (${text.length.toLocaleString('id-ID')} karakter).`; } catch (error) { $('documentStatus').textContent = error.message; } });
$('extractBtn').addEventListener('click', () => { const text = $('extractInput').value; if (!text.trim()) { $('results').innerHTML = '<div class="result-section"><div class="empty">Unggah atau tempel teks terlebih dahulu.</div></div>'; return; } extraction = extractTerms(text); semanticGroups = null; $('semanticBtn').disabled = extraction.candidates.length < 2; renderExtraction(); });
$('semanticBtn').addEventListener('click', async () => { if (!extraction) return; $('semanticBtn').disabled = true; $('cancelSemanticBtn').hidden = false; $('semanticStatus').textContent = 'Memulai AI lokal…'; try { const result = await clusterSemantically(extraction.candidates, { profile: state.aiProfile, threshold: state.threshold }, (message) => { $('semanticStatus').textContent = message; }); semanticGroups = result.groups; renderExtraction(); $('semanticStatus').textContent = `Selesai dengan ${result.model}: ${result.groups.length} kelompok.`; } catch (error) { $('semanticStatus').textContent = error.message; } finally { $('semanticBtn').disabled = false; $('cancelSemanticBtn').hidden = true; } });
$('cancelSemanticBtn').addEventListener('click', () => cancelSemantic());

$('results').addEventListener('click', async (event) => {
  const action = event.target.dataset.reportAction;
  if (action && currentReport) {
    if (action === 'export-doc') exportWord(currentReport);
    else { await navigator.clipboard.writeText(reportText(currentReport, action === 'copy-fixes')); const status = $('reportBarStatus'); if (status) status.textContent = 'Tersalin.'; }
    return;
  }
  if (event.target.dataset.addTerm) { state.terms.push({ canonical: event.target.dataset.addTerm, variants: '' }); renderTerms(); persist('Istilah ditambahkan.'); event.target.disabled = true; }
  if (event.target.dataset.addRule) { const names = JSON.parse(decodeURIComponent(event.target.dataset.addRule)); state.terms.push({ canonical: names[0], variants: names.slice(1).join(', ') }); renderTerms(); persist('Aturan ditambahkan; tinjau istilah bakunya.'); event.target.disabled = true; }
});

$('exportGlossaryBtn').addEventListener('click', () => downloadBlob('glosarium-istilah.json', new Blob([JSON.stringify({ version: 2, terms: state.terms }, null, 2)], { type: 'application/json' })));
$('importGlossaryBtn').addEventListener('click', () => $('glossaryFileInput').click());
$('glossaryFileInput').addEventListener('change', async (event) => { try { const parsed = JSON.parse(await event.target.files[0].text()); if (!Array.isArray(parsed.terms)) throw new Error('Format JSON tidak valid.'); state.terms = parsed.terms.map((x) => ({ canonical: String(x.canonical || ''), variants: String(x.variants || '') })); renderTerms(); persist('Glosarium berhasil diimpor.'); } catch (error) { $('storageStatus').textContent = error.message; } });

renderTerms();
