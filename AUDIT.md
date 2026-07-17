# Audit perubahan v2

## Masalah pada versi lama

1. Seluruh CSS, HTML, state, parser, laporan, dan AI berada dalam satu file berukuran besar.
2. Pencocokan memakai `\b`, yang tidak cukup andal untuk batas kata Unicode dan istilah majemuk.
3. Penggantian dijalankan aturan demi aturan sehingga berpotensi menghasilkan replacement cascade.
4. Varian glosarium yang konflik tidak divalidasi.
5. Deteksi identifier membaca komentar dan string sebagai kode serta hanya menghapus underscore/lowercase.
6. Ekstraksi istilah didominasi frekuensi mentah dan stemming suffix yang terlalu agresif.
7. Clustering AI bersifat greedy: hasil dapat berubah karena urutan kandidat dan mudah membentuk cluster semu.
8. Model AI berjalan di main thread sehingga antarmuka dapat tersendat.

## Perbaikan

- ES modules dengan engine terpisah.
- Pencocokan Unicode, spasi fleksibel, urutan longest-first, lokasi baris/kolom, dan konteks.
- Penggantian satu lintasan berdasarkan posisi asli.
- Deteksi aturan kosong, duplikat, dan konflik.
- Penyimpanan glosarium di localStorage serta impor/ekspor JSON.
- Identifier tokenizer yang mengabaikan komentar/string, memecah camel/Pascal/snake/akronim/angka, dan mengikuti gaya dominan.
- Ekstraksi unigram hingga trigram dengan skor termhood dan clustering ejaan konservatif.
- AI opsional dalam Web Worker, lazy-loaded, dengan profil akurat dan ringan.
- Complete-link clustering dan confidence score untuk mengurangi efek urutan/transitive chaining.
- Parser DOCX lazy-loaded; format teks lain tidak memerlukan library eksternal.
- Unit test untuk engine utama.

## Batasan yang tetap ada

- Pemeriksaan identifier belum memakai AST spesifik JavaScript/Python/PHP, sehingga nama kelas dan variabel yang sengaja berbeda dapat tetap muncul sebagai saran.
- Similarity embedding bukan bukti sinonimi. Hasil AI tidak diterapkan otomatis.
- Model AI pertama kali tetap memerlukan unduhan dari CDN/Hugging Face dan dapat terasa berat pada perangkat lama.
- GitHub Pages tidak dapat menyembunyikan API key; karena itu versi ini tidak memasukkan layanan AI berbayar langsung dari browser.
