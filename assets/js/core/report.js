import { downloadBlob, escapeHtml } from './text-utils.js';

export function reportText(report, onlyRed = false) {
  const lines = ['LAPORAN VALIDASI KONSISTENSI ISTILAH', `Modul: ${report.toolLabel}`, `Tanggal: ${new Date().toLocaleString('id-ID')}`, '', `PERLU DIPERBAIKI (${report.red.length})`];
  lines.push(...(report.red.length ? report.red.map((x) => `- ${x.text}${x.meta ? ` — ${x.meta}` : ''}`) : ['- Tidak ada']));
  if (!onlyRed) {
    lines.push('', `SARAN (${report.blue.length})`);
    lines.push(...(report.blue.length ? report.blue.map((x) => `- ${x.text}${x.meta ? ` — ${x.meta}` : ''}`) : ['- Tidak ada']));
  }
  return lines.join('\n');
}

export function renderReportBar() {
  return `<div class="report-bar"><button class="btn ghost small" data-report-action="copy-full">Copy laporan</button><button class="btn ghost small" data-report-action="copy-fixes">Copy koreksi</button><button class="btn small" data-report-action="export-doc">Ekspor Word</button><span class="subtle" id="reportBarStatus"></span></div>`;
}

export function renderCategories(report) {
  const section = (title, cls, items, empty) => `<div class="result-section"><div class="result-head"><h3 class="${cls}-title">${title}</h3><span class="tally">${items.length} item</span></div>${items.length ? `<ul class="cat-list">${items.map((item) => `<li><span class="cat-dot ${cls}"></span><span>${escapeHtml(item.text)}</span>${item.meta ? `<span class="meta">${escapeHtml(item.meta)}</span>` : ''}</li>`).join('')}</ul>` : `<div class="empty">${empty}</div>`}</div>`;
  return section('Perlu Diperbaiki', 'red', report.red, 'Tidak ada koreksi wajib.') + section('Saran', 'blue', report.blue, 'Tidak ada saran tambahan.');
}

export function exportWord(report) {
  const items = (arr) => arr.length ? arr.map((x) => `<li>${escapeHtml(x.text)}${x.meta ? ` — <i>${escapeHtml(x.meta)}</i>` : ''}</li>`).join('') : '<li>Tidak ada</li>';
  const html = `<!doctype html><html><meta charset="utf-8"><body style="font-family:Calibri,sans-serif"><h1>Laporan Validasi Konsistensi Istilah</h1><p>Modul: ${escapeHtml(report.toolLabel)}<br>Tanggal: ${new Date().toLocaleString('id-ID')}</p><h2>Perlu Diperbaiki (${report.red.length})</h2><ul>${items(report.red)}</ul><h2>Saran (${report.blue.length})</h2><ul>${items(report.blue)}</ul><p><small>Hasil otomatis harus ditinjau sebelum diterapkan.</small></p></body></html>`;
  downloadBlob('laporan-konsistensi-istilah.doc', new Blob(['\ufeff', html], { type: 'application/msword' }));
}
