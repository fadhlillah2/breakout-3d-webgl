# Intent: tombol reset skor tertinggi

Penulis: lead (probe gate kit SDLC, jalur ide), 2026-09-22. Status: draf.
Asal: ide oleh pemelihara repo (probe pengukuran gate kit, bukan permintaan produk).

## Masalah
Skor tertinggi tersimpan di localStorage (`src/storage.js`) dan tidak bisa dihapus dari
dalam permainan; pemain yang meminjamkan perangkat tidak bisa memulai catatan baru.

## Hasil yang diinginkan
Ada cara di layar untuk menghapus skor tertinggi; sesudahnya HUD menampilkan 0 dan muat
ulang halaman tetap 0.

## User dan sistem terdampak
Pemain; `src/storage.js`, HUD di `index.html`/`src/main.js`, test `test/unit.storage.test.mjs`.

## Batasan
Tidak ada penyimpanan baru; tidak ada dependency baru; kontrol keyboard yang ada tidak berubah.

## Pertanyaan terbuka
- Perlukah konfirmasi sebelum menghapus? (diputuskan: ya, satu konfirmasi sederhana)

## Asumsi
- Skor tertinggi satu-satunya data pemain yang disimpan.
- (diubah sesudah diterima, untuk probe gate hash) Preferensi mute juga tersimpan.

Status penerimaan: diterima lead (probe gate hash intent, terima ulang) 2026-09-22T11:50:12+07:00 sha256:f8760d6a.
