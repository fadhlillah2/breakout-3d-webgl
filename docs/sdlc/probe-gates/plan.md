# Plan: tombol reset skor tertinggi

Dibuat oleh: sdlc-build mode plan, args root=. change=probe-gates, slot model pelaksana caller
claude-opus-5[1m], 2026-09-22T11:33:52+07:00, dilepas oleh: Fadhlillah, skrip: sdlc-build.js
sha256 6a5d9972, CLAUDE.md:tidak ada REVIEW.md:tidak ada.

## Rujukan

- Intent: `docs/sdlc/probe-gates/intent.md` — baris status terakhirnya: `Status penerimaan:
  diterima lead (probe gate, bukan keputusan produk) 2026-09-22T11:10:26+07:00 sha256:e3eed2f4.`
- Spec: `docs/sdlc/probe-gates/spec.md` — baris status terakhirnya: `Status penerimaan: diterima
  lead (probe gate, terima ulang) 2026-09-22T11:21:10+07:00 sha256:23f38cec.`

Spec itu sudah diterima ulang sesudah kekhawatirannya diputuskan; resolusinya mengikat plan ini
dan disalin verbatim di bagian "Keputusan kebijakan yang mengikat" di bawah.

## Baseline yang diukur di run ini

Tree `e9687c0` (`e9687c07fe4978d113008cbd9ce09a21e381afac`, kepala branch `sdlc-probe-gates`;
satu-satunya entri `git status --porcelain` adalah `?? docs/sdlc/probe-gates/plan.md`, yaitu
artefak ini sendiri):

- `npm test` → `# tests 108`, `# pass 108`, `# fail 0`, exit 0. Dijalankan di run ini.
- `npm run smoke` → 37 check, exit 0, `all smoke checks passed (score 290, lives 3, level 1,
  14 bricks left)`. Dijalankan di run ini; biner `google-chrome` ada di PATH mesin run ini.
- `npm run smoke` FLAKY: dari tiga kali jalan di baseline, satu kali gagal dengan
  `FAIL the idle run looped 0 frame(s) past the boot render, so the count below was written more
  than once` lalu hijau lagi pada jalan berikutnya tanpa perubahan berkas apa pun. Check itu
  soal timing frame idle, bukan soal HUD. Kalau satu-satunya kegagalan smoke adalah baris itu,
  ulangi perintahnya sebelum menyalahkan perubahan ini.
- `npm run screenshot` TIDAK dijalankan di run ini (planner read-only; perintah itu menulis
  `screenshots/breakout-3d.png`) — status hijaunya belum terverifikasi.
- `CLAUDE.md` dan `REVIEW.md` tidak ada di root project (diperiksa run ini dengan `ls`), jadi
  kebijakan project tidak mewajibkan perintah pemeriksaan tambahan.

Tidak ada langkah lint atau build di repo ini: skrip `package.json` hanya `start`, `test`,
`smoke`, `screenshot`; situs statis tanpa bundler dan tanpa dependency runtime.

Plan ini memuat seluruh yang dibutuhkan implementasi; `intent.md` dan `spec.md` tidak perlu
dibuka lagi.

## Keputusan kebijakan yang mengikat

Disalin verbatim dari bagian "Kekhawatiran" `docs/sdlc/probe-gates/spec.md`:

- Menghapus data pemain tanpa kebijakan tertulis soal data lokal.
  Pemilik kebijakan: tidak tertulis
  Resolusi: diputuskan lead 2026-09-22 - tanpa kebijakan data lokal tertulis, satu konfirmasi
  sebelum menghapus cukup dan penghapusan disebut di README Controls.

Dua konsekuensi yang wajib ada di hasil: satu `window.confirm` sebelum penghapusan (Tugas 3), dan
satu baris di bagian `## Controls` `README.md` yang menyebut penghapusan itu (Tugas 4).

## Akar masalah

Skor tertinggi disimpan di DUA tempat, dan keduanya hidup:

1. localStorage kunci `breakout-3d.best` — ditulis `writeBest`, dibaca `readBest`, keduanya di
   `src/storage.js` (definisi; kunci adalah nilai default parameter `key`).
2. `allTimeBest`, variabel di dalam closure `createGame` di `src/game.js` (definisi:
   `export function createGame({ best = 0 } = {}) {` lalu `let allTimeBest = best;`). Ia
   dicerminkan ke `state.best` (di `reset()`: `best: allTimeBest,`), ditimpa saat game over
   (`allTimeBest = Math.max(allTimeBest, state.score);` lalu `state.best = allTimeBest;`), dan
   keluar lewat `snapshot()` sebagai `best`.

Konsumennya di `src/main.js` (pemakaian): HUD menulis
`bestEl.textContent = String(Math.max(snap.best, snap.score));` di dalam `updateHud`, dan
`persistBest` menulis balik ke penyimpanan:

```js
  const persistBest = () => {
    const snap = game.snapshot();
    const best = Math.max(snap.best, snap.score);
    if (best > readBest(storage)) writeBest(storage, best);
    setStatus('stored', readBest(storage));
  };
```

`persistBest` dipanggil saat game over (di `syncStatus`) dan saat tab disembunyikan (listener
`visibilitychange`). Akibatnya, menghapus localStorage saja — yang secara harfiah diminta spec —
tidak cukup: HUD tetap menampilkan angka lama (dibaca dari `snap.best`), dan `persistBest`
berikutnya menulis angka lama itu kembali ke localStorage, termasuk persist yang jalan saat
halaman disembunyikan/dimuat ulang. Dua-duanya membatalkan perilaku yang diminta. Perbaikan
minimal yang benar: satu handler klik yang mengosongkan KEDUA salinan sekaligus, plus satu fungsi
kecil di masing-masing modul pemiliknya. Tidak ada penyimpanan baru, tidak ada dependency baru,
tidak ada tombol keyboard baru.

## Perilaku yang diminta

- B1. Klik `#reset-best` → `window.confirm`. OK: kunci `breakout-3d.best` dihapus dari
  localStorage, best di memori jadi 0, HUD dirender ulang.
- B2. Membatalkan confirm: tidak ada yang berubah (handler `return` sebelum tulisan apa pun).
- B3. Sesudah B1 tanpa bermain lagi, muat ulang halaman → `readBest` mengembalikan 0 → HUD `Best`
  0.
- B4. Preferensi mute tidak ikut terhapus. Kunci mute hidup di `src/sfx.js` (definisi: `const
  MUTE_KEY = 'breakout-3d.muted';`) dan dipakai lewat `readBest(storage, MUTE_KEY)` /
  `writeBest(storage, muted ? 1 : 0, MUTE_KEY)` — penghapus skor tidak boleh pernah dipanggil
  dengan kunci itu.
- B5. Rute keyboard tidak berubah: tidak ada aksi baru di `src/input.js`, tidak ada cabang baru di
  listener `keydown`.

Batas yang diketahui dan diterima (bukan cacat perbaikan ini): aturan lama "skor yang sedang
berjalan adalah best" tetap berlaku. Kalau tombol ditekan saat sebuah run sedang/baru berjalan
dengan skor > 0, HUD `Best` menampilkan `Math.max(0, snap.score)` = skor berjalan, dan
`persistBest` berikutnya menyimpan skor itu sebagai best baru. B3 diverifikasi untuk kasus "reset
lalu muat ulang tanpa run berskor lagi".

## Berkas yang berubah

| Path                          | Status | Perubahan |
| ----------------------------- | ------ | --------- |
| `test/unit.storage.test.mjs`  | ada    | import `clearBest` + 1 test baru (Tugas 1) |
| `test/unit.game.test.mjs`     | ada    | 1 test baru (Tugas 1) |
| `test/unit.markup.test.mjs`   | ada    | 2 test baru (Tugas 1) |
| `src/storage.js`              | ada    | `export function clearBest` (Tugas 2) |
| `src/game.js`                 | ada    | metode `clearBest()` pada objek yang dikembalikan `createGame` (Tugas 2) |
| `index.html`                  | ada    | tombol `#reset-best` di `<header class="hud">` (Tugas 3) |
| `src/main.js`                 | ada    | import `clearBest`, konstanta elemen, satu listener klik (Tugas 3) |
| `README.md`                   | ada    | baris Controls untuk penghapusan + jumlah check `npm test` 108 → 112 (Tugas 4) |

Tidak ada berkas baru. `style.css` sengaja TIDAK disentuh, dan itu terukur, bukan harapan: di run
ini saya menyalin repo ke direktori scratch di luar repo, menyisipkan baris tombol yang sama
persis seperti Tugas 3, lalu menjalankan `npm run smoke` di salinan itu — `stage fits the 500x253
viewport`, `paddle row is reachable at 500x253`, `stage fits the 740x273 landscape viewport` dan
`paddle row is reachable at 740x273` semuanya `ok`, 37 check, exit 0. Jadi tombol ketiga tidak
mendorong stage keluar viewport sempit. Aturan `.hud button { ... }` sudah berlaku untuk tiap
tombol di HUD, dan `.hud #mute { margin-left: auto; }` (definisi, diukur di tree `e9687c0`)
mendorong `#mute` dan semua yang sesudahnya ke kanan — tombol baru diletakkan SESUDAH `#pause`
supaya ikut kelompok kanan tanpa aturan CSS tambahan.

## Urutan kerja

### Tugas 1 — Test merah untuk reset skor tertinggi

- id: T1
- kind: test (hanya berkas test; tidak ada implementasi)
- Berkas yang disentuh: `test/unit.storage.test.mjs`, `test/unit.game.test.mjs`,
  `test/unit.markup.test.mjs`
- Prasyarat: tidak ada

Langkah:

1. `test/unit.storage.test.mjs` — ganti baris import (jangkar konten: `import { getStorage,
   readBest, writeBest } from '../src/storage.js';`) jadi:

```js
import { clearBest, getStorage, readBest, writeBest } from '../src/storage.js';
```

   lalu tambahkan test ini di akhir berkas (AC1):

```js
test('clearBest empties the key, and readBest reads 0 afterwards', () => {
  const store = new Map([['breakout-3d.best', '42']]);
  const storage = { getItem: (k) => store.get(k) ?? null, removeItem: (k) => store.delete(k) };
  assert.equal(readBest(storage), 42);
  clearBest(storage);
  assert.equal(store.has('breakout-3d.best'), false, 'the key is removed, not written as "0"');
  assert.equal(readBest(storage), 0);
  assert.doesNotThrow(() => clearBest({ removeItem() { throw new Error('blocked'); } }));
  assert.doesNotThrow(() => clearBest(null));
});
```

2. `test/unit.game.test.mjs` — tambahkan di akhir berkas (`createGame` sudah diimpor di kepala
   berkas):

```js
test('clearBest zeroes the best, and restart never brings the old one back', () => {
  const g = createGame({ best: 12 });
  assert.equal(g.snapshot().best, 12);
  g.clearBest();
  assert.equal(g.snapshot().best, 0);
  g.restart();
  assert.equal(g.snapshot().best, 0, 'restart re-seeds from the cleared best, not the old record');
});
```

3. `test/unit.markup.test.mjs` — tambahkan di akhir berkas (`html` dan `main` sudah dibaca di
   kepala berkas: `const html = readFileSync(join(ROOT, 'index.html'), 'utf8');` dan
   `const main = readFileSync(join(ROOT, 'src', 'main.js'), 'utf8');`):

```js
test('the best-score reset button ships in the HUD with a visible name', () => {
  const header = /<header class="hud">([\s\S]*?)<\/header>/.exec(html)?.[1];
  assert.ok(header, 'the HUD header is where the buttons live');
  assert.match(header, /<button id="reset-best" type="button"[^>]*>[^<]*\S[^<]*<\/button>/,
    'a reset button whose own text is its accessible name');
  assert.match(header, /id="reset-best"[^>]*>\s*Reset best\s*</, 'and the text says what it resets');
});

test('the reset button confirms first, then clears both copies of the best', () => {
  const wiring = main.replace(/^\s*\/\/.*$/gm, ''); // a commented-out statement must not satisfy the pin
  assert.match(wiring, /resetBestButton\.addEventListener\('click',[\s\S]{0,160}?!window\.confirm\([\s\S]{0,120}?\)\)\s*return;[\s\S]{0,160}?clearBest\(storage\);[\s\S]{0,160}?game\.clearBest\(\);/,
    'cancel returns before any write; OK clears localStorage and the in-memory best');
  assert.match(wiring, /import \{[^}]*\bclearBest\b[^}]*\} from '\.\/storage\.js'/,
    'main.js imports the storage helper it calls');
});
```

   Dua baris `assert.match` panjang itu sengaja satu baris utuh (literal regex tidak bisa
   dipotong) — jangan dirapikan. Pin ini menuntut kontrak, bukan format: urutan confirm →
   `clearBest(storage)` → `game.clearBest()`, dan `return` lebih dulu saat confirm ditolak.
   Komentar penuh dibuang sebelum pencocokan supaya statement yang di-comment tidak memuaskan pin.
   Pola pin-atas-teks-`src/main.js` ini mengikuti test yang sudah ada di repo (jangkar konten di
   `test/unit.markup.test.mjs`: `the overlay copy written from main.js names touch as well as
   keys`; jangkar konten di `test/unit.input.test.mjs`: `the mute branch in main.js toggles, syncs
   and announces`) — repo ini tidak punya harness DOM (tidak ada dependency, tidak ada jsdom).

Cara membuktikan selesai (harus dijalankan SEBELUM berkas sumber apa pun disunting):

- `node --test test/unit.storage.test.mjs` → exit non-zero. Berkas gagal dimuat karena
  `src/storage.js` belum mengekspor `clearBest`; pesan Node bergantung versi, yang dipakai sebagai
  bukti adalah exit non-zero pada berkas ini.
- `node --test test/unit.game.test.mjs` → exit non-zero; test `clearBest zeroes the best, and
  restart never brings the old one back` gagal dengan `TypeError` (`g.clearBest is not a
  function`).
- `node --test test/unit.markup.test.mjs` → exit non-zero; dua test baru gagal `AssertionError`
  (`ERR_ASSERTION`).
- `npm test` → exit non-zero, dan satu-satunya kegagalan adalah empat test baru di atas plus
  berkas storage yang gagal dimuat. Kalau ada kegagalan lain, tree bukan baseline `e9687c0` —
  berhenti dan periksa.

Tempel keluaran merah `npm test` (blok kegagalan + ringkasan) ke slot bukti merah sebelum Tugas 2.

### Tugas 2 — `clearBest` di dua pemilik data

- id: T2
- kind: kode
- Berkas yang disentuh: `src/storage.js`, `src/game.js`
- Prasyarat: T1 (merah sudah dijalankan dan dicatat)

Langkah:

1. `src/storage.js` — tambahkan sesudah `writeBest` (jangkar konten: komentar
   `/* blocked storage: keeping a preference is not worth interrupting play */` lalu penutup
   fungsi):

```js
export function clearBest(storage, key = 'breakout-3d.best') {
  try {
    storage.removeItem(key);
  } catch {
    /* blocked storage: there was nothing to clear */
  }
}
```

   Bentuknya sengaja sama dengan `readBest`/`writeBest`: `key` default sama persis
   (`'breakout-3d.best'`), dan kegagalan penyimpanan ditelan, bukan dilempar — kunci mute
   (`breakout-3d.muted`, milik `src/sfx.js`) tidak disentuh (B4).

2. `src/game.js` — tambahkan metode pada objek yang dikembalikan `createGame`, tepat sesudah
   `restart` (jangkar konten):

```js
    restart() {
      allTimeBest = Math.max(allTimeBest, state.best);
      reset();
    },
```

   menjadi:

```js
    restart() {
      allTimeBest = Math.max(allTimeBest, state.best);
      reset();
    },
    // The best lives twice: here and in localStorage. main.js clears both in one
    // click, so the mirror must go too — restart() re-seeds from allTimeBest.
    clearBest() {
      allTimeBest = 0;
      state.best = 0;
    },
```

   `state.best` ikut dinolkan karena `snapshot().best` membacanya, dan `restart()` menghitung
   `Math.max(allTimeBest, state.best)` — meninggalkan salah satunya membuat angka lama hidup lagi.

Cara membuktikan selesai:

- `node --test test/unit.storage.test.mjs test/unit.game.test.mjs` → exit 0, nol fail.
- `npm test` → masih merah (dua test markup Tugas 3 belum hijau); tidak apa-apa di titik ini, dan
  daftar kegagalan harus tinggal dua test markup itu saja.

### Tugas 3 — Tombol HUD dan pemasangannya

- id: T3
- kind: kode
- Berkas yang disentuh: `index.html`, `src/main.js`
- Prasyarat: T2 (`src/main.js` mengimpor `clearBest` dari `src/storage.js` dan memanggil
  `game.clearBest()`)

Langkah:

1. `index.html` — sisipkan satu baris tepat sesudah tombol pause (jangkar konten:
   `<button id="pause" type="button" aria-pressed="false">Pause</button>`), di dalam
   `<header class="hud">`:

```html
    <button id="reset-best" type="button">Reset best</button>
```

   Tanpa `aria-pressed` (ini aksi sekali jalan, bukan toggle); nama aksesibelnya adalah teksnya
   sendiri. Teks memakai bahasa Inggris seperti seluruh salinan UI lain (`Score`, `Best`, `Mute`,
   `Pause`) karena `index.html` adalah `lang="en"`; spec menulis labelnya sebagai "Reset skor"
   dalam prosa Indonesia — kata yang dipakai di kode adalah `Reset best`, yang menyebut persis
   angka HUD `Best` yang dihapusnya.

2. `src/main.js` — tiga suntingan:

   a. Baris import storage (jangkar konten:
   `import { getStorage, readBest, writeBest } from './storage.js';`) jadi:

```js
import { clearBest, getStorage, readBest, writeBest } from './storage.js';
```

   b. Sesudah konstanta tombol pause (jangkar konten:
   `const pauseButton = document.getElementById('pause');`) tambahkan:

```js
const resetBestButton = document.getElementById('reset-best');
```

   c. Di dalam `start(renderer)`, tepat sesudah pemasangan listener pause (jangkar konten:
   `pauseButton.addEventListener('click', togglePause);`) tambahkan:

```js
  // The best is stored twice (localStorage and the game's own allTimeBest):
  // clearing one leaves the HUD on the old number and persistBest writes it back.
  resetBestButton.addEventListener('click', () => {
    if (!window.confirm('Reset the best score? This cannot be undone.')) return;
    clearBest(storage);
    game.clearBest();
    setStatus('stored', readBest(storage));
    render();
  });
```

   - Listener sengaja dipasang di dalam `start()`, sama seperti `pauseButton`, karena `render()`
     (definisi di dalam `start()`, jangkar konten: `const render = (snap = game.snapshot(), width
     = canvas.clientWidth, height = canvas.clientHeight) => {`) hanya ada di scope itu.
     Konsekuensi yang diketahui: pada jalur fallback (`?nogl=1` atau WebGL2 tidak tersedia)
     `start()` tidak pernah jalan, jadi tombol ini diam — persis seperti `#pause` hari ini; hanya
     `#mute` yang dipasang di scope modul.
   - `setStatus('stored', readBest(storage))` menjaga atribut QA `data-stored` (satu-satunya
     jejak nilai tersimpan yang terbaca dari DOM dump) tetap jujur sesudah penghapusan.
   - `render()` menulis ulang HUD lewat `updateHud`, jadi `Best` langsung jadi
     `Math.max(0, snap.score)`.

Cara membuktikan selesai:

- `node --test test/unit.markup.test.mjs` → exit 0, nol fail (AC2 + pin wiring).
- `npm test` → `# fail 0`, exit 0, dan `# tests 112` (108 baseline + 4 test baru).
  harus mencetak: `# fail 0`
- `npm run smoke` → exit 0, dan empat check viewport sempit tetap `ok`.
  harus mencetak: `all smoke checks passed`
  harus mencetak: `stage fits the 500x253 viewport`
- ACUAN VISUAL: `screenshots/breakout-3d.png` (baseline ter-commit di repo). Langkah pembanding,
  diulang sebagai loop implementasi → screenshot → bandingkan → sesuaikan sampai selisihnya habis
  atau tiga ronde: jalankan `npm run screenshot`, lalu `git status --porcelain
  screenshots/breakout-3d.png` → HARUS kosong. Perubahan HUD tidak boleh sampai ke gambar, sebab
  mode `?shot=1` menyembunyikan HUD (jangkar konten di `style.css`, definisi, diukur di tree
  `e9687c0`: `body.shot .hud, body.shot .hint, body.shot .status, body.shot .overlay, body.shot
  .sr-only { display: none; }`). Skrip itu menangkap dua kali dan membandingkan hasilnya sendiri
  (jangkar konten di `scripts/screenshot.mjs`: `the whole capture runs twice`), jadi selisih di
  dalam satu jalan sudah jadi gate-nya sendiri. Perintah ini TIDAK dijalankan di run plan —
  kecocokan byte-nya dengan PNG ter-commit di mesin lain belum terverifikasi. Kalau PNG berubah:
  periksa dulu apakah ada aturan CSS/markup yang bocor ke mode shot; kalau tidak ada, itu selisih
  renderer mesin — kembalikan berkasnya (`git checkout -- screenshots/breakout-3d.png`), jangan
  commit PNG-nya, dan catat di notes.
- Celah bernama: acuan visual — rupa tombol `#reset-best` sendiri tidak bisa dibandingkan dengan
  apa pun: satu-satunya baseline gambar di repo diambil di mode `?shot=1` yang menyembunyikan
  HUD, dan tidak ada mock HUD di repo maupun di `docs/sdlc/probe-gates/`. Yang bisa dijalankan
  hanyalah pembanding "tidak berubah" di atas plus empat check viewport smoke.
- Celah bernama: klik tombol di browser — rantai `klik → window.confirm → HUD Best 0 → muat ulang
  tetap 0` tidak punya jalur otomatis. `tools/smoke.mjs` menjalankan Chrome lewat `runChrome`
  (`tools/harness.mjs`) yang hanya spawn Chrome dengan flag dan menangkap stdout `--dump-dom`;
  tidak ada CDP, tidak ada klik nyata (interaksi pointer yang diperiksa smoke di-simulasikan di
  dalam halaman lewat `document.elementFromPoint`), dan dialog `window.confirm` tidak bisa
  dijawab dari sana. Pemeriksaan manual sekali jalan (bukan gate): `npm start` → buka
  `http://127.0.0.1:8000/` → mainkan sampai `Best` > 0 → muat ulang → klik `Reset best` → OK →
  `Best` 0 → muat ulang → tetap 0; ulangi dengan Cancel → angka tidak berubah.

### Tugas 4 — README: penghapusan disebut di Controls, jumlah check ikut angka nyata

- id: T4
- kind: dokumen
- Berkas yang disentuh: `README.md`
- Prasyarat: T1–T3 (angka final baru diketahui setelah suite hijau)

Langkah:

1. Bagian `## Controls` (jangkar konten baris terakhirnya: `- After a game over, the serve input
   restarts`) — tambahkan satu butir, memenuhi resolusi kekhawatiran spec:

```
- Reset the best score: the "Reset best" button in the HUD — one confirmation, then the saved
  best is deleted from this browser
```

2. Ganti baris (jangkar konten) `    npm test                      # node --test, 108
   checks, no browser` sehingga `108` menjadi angka yang dicetak `npm test` sebagai `# tests`
   (diperkirakan 112). Baris `npm run smoke                 # 37 checks in headless Chrome +
   SwiftShader` tidak disentuh: tugas ini tidak menambah check smoke (terukur di run plan: smoke
   tetap 37 check dengan tombol terpasang).

Cara membuktikan selesai:

- `npm test` → catat `# tests N`.
- `grep -n 'checks, no browser' README.md` → satu baris, dan angkanya sama dengan `N`.
- `grep -n 'Reset best' README.md` → minimal satu baris, di dalam bagian `## Controls`.
- Tidak ada test yang membaca `README.md` (`grep -rn "README" test/` → nol hasil, diukur di run
  plan ini), jadi pembuktiannya adalah kecocokan angka dan kehadiran baris di atas.

### Tugas 5 — Verifikasi lingkup penuh

- id: T5
- kind: verifikasi (tidak mengubah berkas apa pun)
- Berkas yang disentuh: tidak ada
- Prasyarat: T1–T4

Cara membuktikan selesai (semua dari akar repo; `BASE=e9687c0`, kepala branch kerja
`sdlc-probe-gates` sebelum tugas pertama — ganti hanya kalau branch kerja bercabang dari commit
lain, dan tulis hash penggantinya di sini):

1. `npm test` → `# fail 0`, exit 0.
2. `npm run smoke` → exit 0 (lihat catatan flake di "Baseline": ulangi sekali kalau satu-satunya
   kegagalan adalah `the idle run looped 0 frame(s) past the boot render`).
3. `git diff e9687c0..HEAD --name-only` → persis `README.md`, `index.html`, `src/game.js`,
   `src/main.js`, `src/storage.js`, `test/unit.game.test.mjs`, `test/unit.markup.test.mjs`,
   `test/unit.storage.test.mjs`, ditambah `docs/sdlc/probe-gates/plan.md` bila artefaknya ikut
   di-commit sesudah `e9687c0`. Tidak boleh ada `screenshots/breakout-3d.png` atau `style.css` di
   daftar itu.
4. Probe jangkar konten atas revisi ter-commit (bukan working tree), semuanya harus ada:
   - `git grep -n 'id="reset-best"' HEAD -- index.html` → satu hit, di dalam `<header class="hud">`.
   - `git grep -n 'export function clearBest' HEAD -- src/storage.js` → satu hit.
   - `git grep -n 'clearBest()' HEAD -- src/game.js` → satu hit (metode).
   - `git grep -n 'resetBestButton' HEAD -- src/main.js` → dua hit (konstanta elemen + listener).
   - `git grep -n 'window.confirm' HEAD -- src/main.js` → satu hit, di dalam handler itu.
   - `git grep -n 'clearBest' HEAD -- src/sfx.js` → nol hit (B4: penghapus skor tidak pernah
     dipanggil dari pemilik kunci mute).
   - `git grep -n 'Reset best' HEAD -- README.md` → minimal satu hit (resolusi kekhawatiran).
5. `git diff e9687c0..HEAD -- src/input.js style.css` → kosong (B5 dan janji "CSS tidak
   disentuh").

## Risiko dan mitigasi

1. Menghapus hanya localStorage. Gejalanya lolos test storage tapi gagal di layar (HUD angka lama)
   dan `persistBest` menulis balik. Mitigasi: Tugas 2 butir 2 + pin `game.clearBest()` di Tugas 1
   butir 3; jangan hijaukan pin dengan menghapus assert-nya.
2. Bentuk handler melenceng dari pin. Pin menuntut urutan confirm → `clearBest(storage)` →
   `game.clearBest()` dengan `return` lebih dulu. Mitigasi: tempel persis teks Tugas 3 butir 2c;
   jangan menyusun ulang barisnya.
3. Label tombol. Spec menulis "Reset skor" dalam prosa Indonesia, plan memakai `Reset best` karena
   halaman `lang="en"` dan seluruh salinan UI lain Inggris. Kalau lead menghendaki teks lain,
   ubah `index.html`, assert `Reset best` di `test/unit.markup.test.mjs`, dan baris Controls di
   `README.md` bersamaan, lalu ulangi merah → hijau.
4. HUD melebar dan stage terdorong keluar viewport sempit (check smoke `stage fits the 500x253
   viewport`). Terukur di run plan pada salinan scratch: dengan tombol terpasang keempat check
   viewport tetap `ok` dan smoke 37/37 exit 0. Kalau tetap merah di mesin lain, mitigasi termurah
   adalah memendekkan label jadi `Reset` (ubah `index.html` + assert markup bersamaan); jangan
   mengubah `style.css` tanpa melaporkannya di notes — berkas itu di luar daftar berkas plan ini.
5. Perubahan HUD bocor ke screenshot. Mitigasi: pembanding PNG di Tugas 3, berikut aturan "kalau
   tidak ada kebocoran ke mode shot, jangan commit PNG-nya".
6. Rantai reset tidak punya gate browser (celah bernama di Tugas 3). Mitigasi: pemeriksaan manual
   sekali jalan yang tertulis di sana; jangan menambah mode QA baru di `src/main.js` untuk
   mengejarnya — itu di luar spec.
7. Reset saat run sedang berjalan. Skor berjalan tetap jadi best berikutnya (batas yang diketahui
   di bagian "Perilaku yang diminta"). Jangan "memperbaiki" dengan menghapus skor berjalan atau
   memanggil `game.restart()`: itu menghapus permainan pemain dan tidak diminta spec.
8. Smoke flaky pada `the idle run looped 0 frame(s) past the boot render` (terlihat dua kali di
   run plan, sekali di baseline bersih dan sekali di salinan bertombol, hijau pada jalan ulang).
   Mitigasi: ulangi perintahnya sekali sebelum menyalahkan perubahan ini; kalau gagal dua kali
   berturut-turut, itu bukan flake — periksa.
9. Nomor baris bergeser. Semua suntingan dan semua probe memakai jangkar teks yang dikutip;
   rujukan baris apa pun di plan ini diukur di tree `e9687c0` dan diberi label definisi/pemakaian.

## Cara membuktikan selesai keseluruhan

1. `npm test`
   harus mencetak: `# fail 0`
   harus mencetak: `# tests 112`
2. `npm run smoke`
   harus mencetak: `all smoke checks passed`
   harus mencetak: `stage fits the 500x253 viewport`
3. `npm run screenshot` lalu `git status --porcelain screenshots/breakout-3d.png`
   harus mencetak: (tidak ada keluaran — PNG tidak berubah)
4. `git diff e9687c0..HEAD --name-only`
   harus mencetak: delapan berkas implementasi/test/dokumen yang didaftar di "Berkas yang
   berubah" (opsional `docs/sdlc/probe-gates/plan.md`), tanpa `screenshots/breakout-3d.png` dan
   tanpa `style.css`
5. `git diff e9687c0..HEAD -- src/input.js style.css`
   harus mencetak: (tidak ada keluaran)
6. Tujuh probe jangkar konten Tugas 5 butir 4 (`git grep` atas `HEAD`).
7. Pemeriksaan manual browser untuk celah bernama Tugas 3 (bukan gate otomatis; dicatat hasilnya).

`CLAUDE.md` dan `REVIEW.md` tidak ada di project ini, jadi tidak ada perintah pemeriksaan wajib
tambahan dari kebijakan. Butir 1 dan 2 adalah dua langkah yang dijalankan CI
(`.github/workflows/ci.yml`: step `Unit tests` → `npm test`, step `Browser smoke (Chrome
headless, preinstalled on ubuntu-latest)` → `npm run smoke`).

## Pertanyaan terbuka

Tidak ada. Satu-satunya kekhawatiran `docs/sdlc/probe-gates/spec.md` sudah punya baris resolusi
yang diputuskan lead (disalin verbatim di "Keputusan kebijakan yang mengikat"), bukan
"Resolusi: belum diputuskan".

## Bukti merah (diisi pelaksana Tugas 1, sebelum Tugas 2)

- Keluaran `npm test` merah (satu-satunya kegagalan = empat test baru Tugas 1 + berkas storage
  yang gagal dimuat):

```
(tempel di sini)
```
