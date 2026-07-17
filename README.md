# Validator Konsistensi Istilah v2

Aplikasi statis modular untuk GitHub Pages. Semua pemeriksaan deterministik berjalan lokal. Model AI hanya dimuat ketika pengguna menekan tombol analisis semantik.

## Struktur

- `index.html` — markup aplikasi
- `assets/css/styles.css` — tampilan
- `assets/js/app.js` — orkestrasi UI
- `assets/js/core/` — engine glosarium, identifier, ekstraksi, file, laporan, storage
- `assets/js/ai/` dan `assets/js/workers/` — AI lokal dalam Web Worker
- `tests/` — unit test engine

## Menjalankan lokal

ES modules tidak boleh dibuka langsung lewat `file://`.

```bash
npm run serve
```

Buka `http://localhost:8000`.

## Uji

```bash
npm test
```

## Deploy GitHub Pages

Push isi folder ini ke branch utama, lalu pilih **Settings → Pages → Deploy from a branch** dan gunakan folder root. Tidak diperlukan build step.

## Catatan AI

Mode akurat menggunakan `Xenova/multilingual-e5-small`; mode ringan menggunakan `Xenova/paraphrase-multilingual-MiniLM-L12-v2`. Transformers.js dan model dimuat dari CDN/Hugging Face hanya saat dibutuhkan. Hasil AI adalah kandidat sinonim, bukan koreksi otomatis.
