# Intent: Space saat overlay Paused hanya melanjutkan, tidak menyervis bola

Penulis: sdlc-plan (draf unattended, jalur tiket, slot model pelaksana caller), 2026-09-22. Status: draf.

## Masalah

Kutipan Tiket #41 (pemain), apa adanya:

> Kalau saya tekan Space saat overlay Paused tampil, bola langsung diservis padahal saya cuma mau lanjut main. Harusnya Space saat paused cuma melanjutkan permainan, servis baru terjadi kalau bola memang belum diservis. Ini terjadi di Chrome desktop, keyboard; belum coba di HP.

Yang saya buka sendiri di HEAD `89c3ce5`:

- Tombol aksi lewat satu pintu: `src/main.js:454-458` — `action === 'serve'` → `preventDefault()` → `primaryAction()`; routing-nya di `src/input.js:11-18` (`Space`/`Enter`/`NumpadEnter`, auto-repeat ditolak).
- `src/main.js:417-423` `primaryAction()`: `ready` → `game.serve()`, `over` → `game.restart()`, `paused` → `game.resume()`.
- `src/game.js:286-287` `serve()` keluar lebih awal bila `state.state !== 'ready'`; `src/game.js:548-556` `pause()` menyimpan `resumeTo`, `resume()` kembali ke state itu — bukan menyervis.
- State `paused` punya tiga pintu masuk: `togglePause()` (`src/main.js:425-430`, dari `playing`/`life-lost`, tidak pernah dari `ready`/`over`), `visibilitychange` saat tab disembunyikan (`src/main.js:472-480`, baris 478), dan `webglcontextlost` (`src/main.js:517-529`, baris 526). Ketiganya menetapkan state `paused` yang sama.
- Judul overlay "Paused" muncul untuk setiap `snapshot().state === 'paused'` (`src/main.js:374-390`, khususnya 378-381), jadi tanpa memandang pintu masuknya — termasuk jeda dari `playing` yang sudah diservis.
- Nol test yang menekan tombol: `test/unit.input.test.mjs:21-28` hanya memaku routing murni `keyAction`; grep `dispatchEvent`/`KeyboardEvent` di `test/`, `tools/`, `scripts/`, `src/`, `index.html` kosong.

Cek terkendali yang saya jalankan sendiri di Chrome headless (server lokal `tools/serve.mjs`, `?debug=1`, keydown disintesis ke `window`); keluaran tool:

- `ready` + Space → `playing`, `ballV [-2.319, 3.502]` — diservis.
- `playing` + Escape → `paused`, judul overlay "Paused".
- `paused` (dari `playing`) + Space → `playing`, `ballV [-2.319, 3.502]` tidak berubah — melanjutkan, bukan menyervis.
- `paused` dari `life-lost` (overlay "Paused" tampil untuk state `paused` dari pintu masuk mana pun — `src/main.js:378-381`; jalur masuk `paused` ada tiga: `src/main.js:428`, `src/main.js:478`, `src/main.js:526`) + Space → kembali ke `life-lost`, bola tetap jatuh (`ballV [2.319, -2.4]` tidak berubah); setelah `lostTimer` habis state `ready` dengan bola menempel di dayung (`ballV [0, 0]`), tanpa servis otomatis.

Jadi keluhan tiket belum bisa saya reproduksi di kode ini; itu pertanyaan terbuka pertama, bukan anggapan bahwa pemain salah.

## Hasil yang diinginkan

- Space/Enter/NumpadEnter saat overlay Paused tampil hanya melanjutkan: state kembali ke state sebelum jeda, dan bola yang sudah terlanjur diservis meneruskan posisi/kecepatannya (tidak di-reset ke dayung dan tidak diberi kecepatan baru).
- Bola yang belum diservis tetap belum diservis sesudah resume; servis tetap hanya dari `ready` (`src/game.js:286-287`).
- Servis tetap bisa dari jalur yang ada sekarang: Space/Enter, klik/tap kanvas, tombol overlay (`src/main.js:443-451`).
- Nol perubahan perilaku lain: Esc/P, M, tombol dayung, dan mode deterministik (`?autotest=1`, `?shot=1`, `?nogl=1`) sama seperti sekarang.

## User dan sistem terdampak

- Pemain keyboard desktop (tiket: Chrome desktop; HP kata pemain belum diuji).
- `src/main.js` (aksi primer, `togglePause`, handler keydown), `src/game.js` (state `ready`/`playing`/`paused`/`life-lost`/`over`), `src/input.js` (routing), test yang menyentuh ketiganya.

## Batasan

- Arti tombol lain tidak berubah (Esc, P, M, panah, A/D), termasuk aturan auto-repeat dan modifier yang sudah dipaku `test/unit.input.test.mjs:24-52`.
- Tanpa dependency baru (`package.json` hanya punya `scripts`).
- Determinisme utuh: `serve()` disemai dari level saja (`src/game.js:288-291`), dan keluaran mode QA tidak berubah (smoke 37 cek, screenshot byte-identik).
- `npm test` dan `npm run smoke` tetap hijau.
- Teks UI tetap bahasa Inggris; tidak ada permintaan mengubah teks.
- Perubahan hanya di jalur interaktif; mode `?autotest=1`/`?shot=1`/`?nogl=1` tidak disentuh.

## Pertanyaan terbuka

- Repro tiket belum terkonfirmasi di HEAD `89c3ce5`: langkah persisnya apa, apakah overlay benar-benar berjudul "Paused" saat Space ditekan, dan apakah bola sudah diservis saat itu?
- Apakah yang pemain alami adalah dua tekan cepat (Space untuk resume, Space lagi untuk servis) sehingga terasa "langsung diservis"?
- Haruskah Space saat paused-dari-`life-lost` menahan bola di tempat (bukan melanjutkan jatuh) — sumber tidak menyebut state ini?
- Ukuran suksesnya apa: cukup perilaku benar, atau wajib ada test/gate baru yang menekan tombol aksi saat paused?
- Apakah aturan yang sama berlaku untuk tap/klik di HP (tombol overlay dan tap kanvas) — sumber bilang "belum coba di HP"?
- Perlukah teks (overlay paused, hint `index.html`, README) menyatakan aturan ini — sumber tidak meminta?

## Asumsi

- Asumsi: perubahan ini disertai satu bukti yang bisa dijalankan yang memaku aturan Space-saat-paused sebelum dan sesudah perubahan; tiket tidak menyebut test/gate sama sekali, jadi ini kebiasaan project (lihat juga "Pertanyaan terbuka" soal ukuran sukses), bukan permintaan pemain. (coret bila salah)
- Asumsi: keinginan pemilik adalah satu Space kontekstual — dari `ready` menyervis, dari `paused` melanjutkan — jadi tidak ada arti tombol baru yang ditambah. (coret bila salah)
- Asumsi: `Enter` dan `NumpadEnter` mengikuti aturan Space yang sama, karena ketiganya satu aksi `serve` (`src/input.js:11-18`). (coret bila salah)
- Asumsi: laporan pemain benar sebagai pengalaman; target Chrome desktop + keyboard, HP di luar scope sampai sumber bilang lain. (coret bila salah)
- Asumsi: bila ada perbaikan, ia diletakkan di satu titik aksi primer (`primaryAction`), bukan tambalan di tiap pemanggil. (coret bila salah)
- Asumsi: tidak ada perubahan teks UI yang diminta. (coret bila salah)
