# Spec: tombol reset skor tertinggi

Dibuat oleh: sdlc-design, args root=. (repo breakout-3d-webgl) change=probe-gates-2, slot model pelaksana caller: opus (claude-opus-5[1m]), 2026-09-22T11:52:48+07:00, dilepas oleh: Fadhlillah, skrip: sdlc-design.js sha256 bb7921f4, CLAUDE.md:tidak ada REVIEW.md:tidak ada.

Rujukan intent: `docs/sdlc/probe-gates-2/intent.md`
Baris status penerimaan intent (disalin apa adanya):
`Status penerimaan: diterima lead (probe gate hash intent, terima ulang) 2026-09-22T11:50:12+07:00 sha256:f8760d6a.`

Hash isi `intent.md` di atas baris penerimaan terakhir pada tree ini: `f8760d6a` - cocok dengan
`sha256:f8760d6a` yang baris penerimaan sebut. Spec ini dibangun di atas isi intent yang diterima.

Tree tempat semua rujukan baris di bawah diukur: branch `sdlc-probe-gates` @ `2e6aa70`, working tree
tanpa perubahan ter-track (`git status --porcelain` hanya melaporkan `?? docs/sdlc/probe-gates-2/`).

Kebijakan project: `CLAUDE.md` dan `REVIEW.md` tidak ada di repo ini (dicari sampai kedalaman 3,
tidak ditemukan). Jadi tidak ada kelas risiko tertulis yang bisa dirujuk.

## Persyaratan teknis
- Penghapus skor tertinggi di `src/storage.js`: mengosongkan kunci penyimpan skor (bawaan
  `'breakout-3d.best'`), berparameter kunci seperti `readBest`/`writeBest` yang sudah ada, dan
  menelan kegagalan storage seperti keduanya (private mode / kuota / storage `null` tidak melempar).
- Cara menurunkan skor tertinggi yang hidup di memori game ke 0. Permukaan publik `createGame`
  (`src/game.js:543`) hanya punya `serve, tick, setPaddle, nudgePaddle, pause, resume, restart,
  view, snapshot` - tidak ada penurun best. Tanpa penurun itu penghapusan tidak bertahan: nilai lama
  masih di `allTimeBest`, `restart()` menaikkannya lagi dari `state.best`, dan `persistBest` di
  `src/main.js` menulisnya kembali ke storage pada persist berikutnya karena syarat tulisnya
  `best > readBest(storage)`.
- Satu kontrol di layar yang memanggil penghapusan sesudah satu konfirmasi. Bukan tombol keyboard
  baru: `keyAction` (`src/input.js:41`) memetakan serve/pause/mute/left/right dan batasan intent
  melarang mengubah kontrol keyboard yang ada.
- Tanpa kunci penyimpanan baru dan tanpa dependency baru (batasan intent; `package.json` memang
  tidak punya blok `dependencies`, hanya `scripts`).
- Penghapusan hanya menyentuh kunci skor tertinggi; kunci preferensi mute `'breakout-3d.muted'`
  (`src/sfx.js:7`) tidak ikut terhapus - lihat Kekhawatiran 1, cakupan ini belum diputuskan lead.

## Behavior yang diharapkan
- Menekan kontrol lalu mengonfirmasi: kunci skor tertinggi kosong di storage, skor tertinggi di
  memori 0, dan muat ulang halaman tetap 0 (nilai awal dibaca sekali di `src/main.js:55`).
- Angka "Best" di HUD sesudah konfirmasi menampilkan `Math.max(best, skor berjalan)`, bukan selalu 0:
  HUD menulis `Math.max(snap.best, snap.score)` (`src/main.js:373`). Jadi 0 pada keadaan segar,
  `ready`, atau `over` dengan skor 0; pada permainan berjalan dengan skor 120 ia menampilkan 120.
  Intent minta "sesudahnya HUD menampilkan 0" - terpenuhi hanya bila skor berjalan 0 (Kekhawatiran 2).
- Konsekuensi lanjutan yang sama sumbernya: reset di tengah permainan dengan skor berjalan > 0 akan
  menulis ulang skor itu ke storage pada `persistBest` berikutnya (`src/main.js:395-399`, dipanggil
  saat game over `:410` dan saat tab disembunyikan `:475`). Reset menghapus catatan lama, bukan
  membekukan best ke 0 untuk sisa permainan.
- Membatalkan konfirmasi: tidak ada tulisan ke storage, tidak ada penghapusan, tidak ada perubahan HUD.
- Storage diblokir (private mode / kuota) atau `null`: reset tidak melempar dan permainan tetap jalan,
  sama seperti `readBest`/`writeBest` yang ada.
- Preferensi mute dan kontrol Mute/Pause yang ada tidak berubah oleh reset.

## Acceptance criteria
- AC1: test unit di `test/unit.storage.test.mjs` membuktikan penghapus mengosongkan kunci skor dan
  `readBest` mengembalikan 0 sesudahnya, pada storage tiruan.
- AC2: test unit yang sama membuktikan penghapus tidak melempar pada storage yang memblokir
  (`{ removeItem() { throw new Error('blocked'); } }`) dan pada storage `null`, sejajar dengan test
  penulis yang ada di `test/unit.storage.test.mjs:20-23`.
- AC3: test unit membuktikan penghapus tidak menyentuh kunci `'breakout-3d.muted'` (berlaku bila
  Kekhawatiran 1 diputuskan "hanya kunci skor"; bila lead memutuskan lain, AC ini ikut berubah).
- AC4: test unit atas game membuktikan skor tertinggi di memori bisa turun ke 0: sesudah reset,
  `snapshot().best === 0`, dan tetap 0 sesudah `restart()`.
- AC5: test markup membuktikan kontrol reset ada di HUD `index.html` dengan label yang terbaca
  pembaca layar, mengikuti pola pemeriksaan tombol mute di `test/unit.markup.test.mjs:40-42`.
- AC6: `npm test` (`node --test`, `package.json:9`) hijau, termasuk test teks kontrol yang ada
  (`test/unit.markup.test.mjs:15-27`) yang tidak boleh rusak oleh teks baru di HUD atau hint
  (`index.html:47`).
- AC7 (bila Chrome tersedia; `tools/harness.mjs:37` `findChrome`): `npm run smoke`
  (`package.json:10`) hijau - pemeriksaan HUD best (`tools/smoke.mjs:96-97`), nilai tersimpan
  (`tools/smoke.mjs:105`), dan storage terblokir (`tools/smoke.mjs:165-169`) tetap lulus.

## Kekhawatiran
1. Menghapus data pemain lokal tanpa kebijakan tertulis soal data lokal di tree ini (tidak ada
   `CLAUDE.md`, tidak ada `REVIEW.md`), dan cakupan penghapusan tidak bisa saya putuskan: hanya
   `'breakout-3d.best'`, atau semua kunci `breakout-3d.*` termasuk preferensi mute
   `'breakout-3d.muted'` (`src/sfx.js:7`). Asumsi intent saling bertabrakan soal ini (Asumsi 1 vs 2).
   Pemilik kebijakan: tidak tertulis
   Resolusi: belum diputuskan
2. Hasil yang intent minta - "sesudahnya HUD menampilkan 0" - tidak bisa dipenuhi secara harfiah
   tanpa mengubah rumus HUD `Math.max(snap.best, snap.score)` (`src/main.js:373`), dan rumus itu
   dijaga gate yang ada: `tools/smoke.mjs:96-97` memeriksa `hud(auto, 'best') === Math.max(expected.best,
   expected.score)`, sementara komentar di `src/main.js:393-394` menyatakan HUD sengaja memperlakukan
   skor berjalan sebagai best supaya persist mid-run tidak membuang permainan bagus. Pilihannya -
   terima HUD menampilkan skor berjalan sesudah reset, atau ubah rumus HUD berikut gate-nya - bukan
   keputusan saya.
   Pemilik kebijakan: `tools/smoke.mjs` (gate smoke) dan komentar desain `src/main.js:393-394`
   Resolusi: belum diputuskan

Kelas risiko: tidak ada

## Asumsi dan pertanyaan terbuka
- Asumsi 1 (dibawa dari intent, bertabrakan dengan tree): "Skor tertinggi satu-satunya data pemain
  yang disimpan". Tree menyangkal: `src/sfx.js:7` menyimpan preferensi mute di `'breakout-3d.muted'`
  lewat pembaca/penulis yang sama (`src/sfx.js:28`).
- Asumsi 2 (dibawa dari intent, ditulis intent sebagai tambahan sesudah penerimaan pertama):
  "Preferensi mute juga tersimpan" - ini yang cocok dengan tree.
- Asumsi 3 (lahir di sini): kontrol reset diletakkan di HUD `index.html` bersama tombol Mute dan
  Pause yang ada (`index.html:30-31`), karena intent minta "cara di layar" dan pola tombol HUD plus
  wiring listener-nya sudah ada di sana (`src/main.js:60-64`, `src/main.js:452`).
- Asumsi 4 (lahir di sini): konfirmasi memakai kemampuan dialog bawaan browser, sehingga batasan
  "tidak ada dependency baru" terpenuhi. Intent memutuskan "ya, satu konfirmasi sederhana" tanpa
  menyebut bentuknya.
- Pertanyaan terbuka 1: apakah reset ikut menghapus preferensi mute? (sumber Kekhawatiran 1;
  jawabannya mengubah AC3 dan cakupan penghapus.)
- Pertanyaan terbuka 2: sesudah reset di tengah permainan, HUD menampilkan skor berjalan atau dipaksa
  0? (sumber Kekhawatiran 2; jawabannya mengubah Behavior, AC7, dan mungkin `tools/smoke.mjs`.)
- Pertanyaan "perlukah konfirmasi sebelum menghapus" tidak dibuka lagi: intent menandainya
  diputuskan (ya, satu konfirmasi sederhana).

## Rujukan baris
Semua diukur pada tree yang disebut di kepala berkas.
- `src/storage.js:5` `getStorage()` - definisi.
- `src/storage.js:14` `readBest(storage, key = 'breakout-3d.best')` - definisi (kunci bawaan skor).
- `src/storage.js:23` `writeBest(storage, value, key = 'breakout-3d.best')` - definisi (kunci bawaan
  sama, menelan kegagalan).
- `src/sfx.js:7` `const MUTE_KEY = 'breakout-3d.muted';` - definisi.
- `src/sfx.js:28` `let muted = readBest(storage, MUTE_KEY) > 0;` - pemakaian (mute memakai pembaca skor).
- `src/game.js:221` `export function createGame({ best = 0 } = {})` - definisi (satu-satunya jalan
  masuk nilai best).
- `src/game.js:222` `let allTimeBest = best;` - definisi (skor tertinggi di memori).
- `src/game.js:279` `best: allTimeBest,` di dalam `reset()` - pemakaian.
- `src/game.js:511-512` `allTimeBest = Math.max(allTimeBest, state.score); state.best = allTimeBest;`
  - pemakaian (saat game over).
- `src/game.js:543` `return { ... }` - definisi permukaan publik game (serve, tick, setPaddle,
  nudgePaddle, pause, resume, restart, view, snapshot).
- `src/game.js:559` `allTimeBest = Math.max(allTimeBest, state.best);` di `restart()` - pemakaian.
- `src/game.js:563-567` `snapshot()` mengembalikan `best: state.best` - definisi kontrak snapshot.
- `src/main.js:16` import `getStorage, readBest, writeBest` - pemakaian.
- `src/main.js:35` `const bestEl = document.getElementById('best');` - pemakaian.
- `src/main.js:36-37` `pauseButton`, `muteButton` - pemakaian (elemen tombol HUD yang ada).
- `src/main.js:54-55` `getStorage()` dan `createGame({ best: readBest(storage) })` - pemakaian
  (pembacaan awal saat muat halaman).
- `src/main.js:60-64` `syncMute` dan `muteButton.addEventListener('click', ...)` - pemakaian
  (pola tombol HUD yang diikuti Asumsi 3).
- `src/main.js:373` `bestEl.textContent = String(Math.max(snap.best, snap.score));` - pemakaian
  (kenapa HUD tidak selalu 0 sesudah reset).
- `src/main.js:393-394` komentar desain HUD/persist - definisi alasan rumus itu.
- `src/main.js:395-399` `persistBest` dengan syarat `best > readBest(storage)` - pemakaian
  (kenapa best di memori harus ikut turun).
- `src/main.js:410` dan `src/main.js:475` panggilan `persistBest()` - pemakaian (game over, tab hidden).
- `src/main.js:452` `pauseButton.addEventListener('click', togglePause);` - pemakaian (pola listener).
- `src/input.js:41-46` `keyAction` - definisi peta kontrol keyboard yang tidak boleh berubah.
- `index.html:29` `<strong id="best">0</strong>` - definisi elemen HUD.
- `index.html:30-31` tombol `#mute` dan `#pause` - definisi (pola tombol HUD yang diikuti).
- `index.html:47` `<p class="hint">` - definisi teks hint yang dijaga test markup.
- `test/unit.storage.test.mjs:20-23` test `writeBest never throws` - pemakaian (pola AC2).
- `test/unit.markup.test.mjs:40-42` test tombol mute di HUD - pemakaian (pola AC5).
- `test/unit.markup.test.mjs:15-27` test teks kontrol - pemakaian (yang tidak boleh rusak, AC6).
- `tools/smoke.mjs:96-97` pemeriksaan HUD best - pemakaian (AC7, Kekhawatiran 2).
- `tools/smoke.mjs:105` pemeriksaan `data-stored` - pemakaian (AC7).
- `tools/smoke.mjs:165-169` pemeriksaan storage terblokir - pemakaian (AC7).
- `tools/harness.mjs:37` `findChrome` - definisi (syarat AC7).
- `package.json:9` `"test": "node --test"` - definisi perintah test.
- `package.json:10` `"smoke": "node tools/smoke.mjs"` - definisi perintah smoke.
