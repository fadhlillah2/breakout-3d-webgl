# Plan: pintasan keyboard `M` untuk mute/unmute

Rujukan: `docs/sdlc/mute-key/intent.md` (commit `7064c7e`, diterima user 2026-09-21) dan
`docs/sdlc/mute-key/spec.md` (commit `839e61c`; tree kerja = HEAD `839e61c`, bersih).
Baseline terukur di tree ini: `npm test` → 107 pass, 0 fail, exit 0 (node v20.19.6).
Plan ini memuat seluruh yang dibutuhkan untuk implementasi; intent.md dan spec.md tidak
perlu dibuka lagi.

## Akar masalah

Mute hanya bisa lewat tombol HUD (`index.html:30`; handler klik `src/main.js:64`;
`sfx.toggle` hanya dipanggil di situ). Routing keyboard `keyAction` (`src/input.js:30-36`)
mengenal `serve`, `pause`, `left`, `right` (plus `'native'`) dan tidak mengenal `KeyM`,
jadi pemain keyboard harus pindah ke mouse untuk mute. Perbaikan minimal di akar: satu
predikat + satu rute di `keyAction` (tempat semua aturan tombol dipaku), satu cabang
dispatch di handler `keydown` (`src/main.js:454-460`), lalu tiga salinan teks kontrol.

## Perilaku yang diminta

- B1. `M` (`event.code === 'KeyM'`) tanpa auto-repeat menghasilkan aksi `'mute'`;
  `repeat: true` menghasilkan `null` (seperti `Esc`), jadi mute tidak berkedip bolak-balik.
- B2. Aksi `'mute'` mengganti mute persis seperti klik tombol Mute: `sfx.toggle()` lalu
  `syncMute()`. Efeknya: `sfx.muted` berbalik, `aria-pressed` tombol `#mute` jadi
  `String(sfx.muted)`, label berganti `Mute`/`Unmute`, dan nilai tersimpan ke localStorage
  (`breakout-3d.muted`, 1/0) lewat `writeBest` (`src/sfx.js:7,64`).
- B3. `M` tetap bekerja saat fokus ada di elemen interaktif: `isInteractiveTarget`
  (`src/input.js:23-26`) hanya untuk `Space`/`Enter` yang mengaktifkan tombol secara
  native; `Esc` tidak digerbangi, `M` mengikuti `Esc`.
- B4. Tombol Mute, Pause, serve, paddle, dan kontrol sentuh tidak berubah; `keyup`
  (`src/main.js:461-464`) tidak disentuh karena mute bukan tombol yang ditahan.
- B5. Tiap salinan teks kontrol yang menyebut `Esc` ikut menyebut `M`.
- B6. Pemain yang bermain penuh dengan keyboard bisa mute/unmute tanpa mouse.

Batasan: tanpa dependency baru (`package.json` tetap tanpa field `dependencies` maupun
`devDependencies`); tanpa `preventDefault` dan tanpa cek modifier; tanpa refactor, ekspor
baru, atau berkas baru selain `plan.md` ini.

## Berkas yang berubah

| Path                         | Status | Perubahan |
| ---------------------------- | ------ | --------- |
| `test/unit.input.test.mjs`   | ada    | +3 assertion `KeyM` + 1 pin cabang `main.js` (Task 1, Task 3) |
| `src/input.js`               | ada    | predikat `isMuteKey` + cabang `'mute'`; komentar header (Task 2) |
| `src/main.js`                | ada    | +1 cabang dispatch `'mute'` di handler `keydown` (Task 3) |
| `README.md`                  | ada    | Controls + Accessibility menyebut `M`; baris 98 `108 checks` (Task 4) |
| `index.html`                 | ada    | hint baris 47 menyebut `M = mute` (Task 4) |
| `docs/sdlc/mute-key/plan.md` | baru   | rencana ini (artefak; bukan bagian diff implementasi) |

Aturan test-first: Task 1 menulis dan menjalankan assertion merah lebih dulu; Task 2 jangan
dimulai sebelum run merah itu dilakukan. Task 3 menulis test pin cabang `main.js` merah
lebih dulu, lalu baru menyunting `src/main.js`.

## Urutan kerja

### Task 1 — Assertion `KeyM` merah lebih dulu

- Berkas: `test/unit.input.test.mjs` (hanya menambah 3 assertion di dalam test yang sudah
  ada; tetap satu test, bukan test baru).
- Prasyarat: tidak ada.
- Langkah: di test `keyAction routes each key to the action main.js applies` (mulai baris
  18, helper `on()` baris 19), setelah pasangan `Escape` (baris 24-25) tambahkan dengan
  pola yang sama:

  ```js
  assert.equal(on('KeyM'), 'mute');
  assert.equal(on('KeyM', { repeat: true }), null, 'a held M never re-toggles mute');
  assert.equal(on('KeyM', { target: { closest: () => ({}) } }), 'mute',
    'a focused button never gates M (T4/B3)');
  ```

  Assertion ketiga memakai bentuk target tombol yang sama dengan test `a serve key on a
  focused button is left to the browser` (baris 34); helper `on()` menyebar `extra`
  sehingga `target` menimpa `null`. Assertion inilah yang memaku `M` tidak digerbangi
  `isInteractiveTarget` (T4/B3) — test serve hanya menguji `Space`, jadi ia bukan bukti
  untuk `M`.
- Bukti selesai (dijalankan sebelum implementasi): perintah `npm test` → exit non-zero;
  test `keyAction routes each key to the action main.js applies` gagal pada `on('KeyM')`
  (diharapkan `'mute'`, diterima `null`; diprobe di tree ini). `node:test` berhenti di
  assertion gagal pertama, jadi run merah hanya melaporkan `on('KeyM')` dan assertion
  ketiga belum tercapai. Dua sisanya diprobe pra-perubahan: `repeat: true` sudah `null`
  (pin anti-regresi yang baru mengikat setelah Task 2), dan varian target tombol juga
  `null` — ia gagal bila `M` digerbangi `isInteractiveTarget` (target tombol akan
  memulangkan `'native'`, seperti `Space`; terukur di tree ini).

### Task 2 — `src/input.js`: predikat `isMuteKey` + rute `'mute'`

- Berkas: `src/input.js`.
- Prasyarat: Task 1 (assertion merah sudah dijalankan).
- Langkah:
  1. Baris 2 (komentar header): `serve/pause never auto-repeat` menjadi
     `serve/pause/mute never auto-repeat`; baris jadi
     `// serve/pause/mute never auto-repeat, paddle keys are held (repeat is fine).`
  2. Setelah `isPauseKey` (baris 9-11), tambah predikat tanpa ekspor (pola sama dengan
     `isPauseKey`/`isServeKey`; diuji lewat `keyAction`, bukan diekspor):

     ```js
     function isMuteKey(event) {
       return !event.repeat && event.code === 'KeyM';
     }
     ```

  3. Di `keyAction` (baris 30-36), setelah baris 32 (`if (isPauseKey(event)) return
     'pause';`) tambah satu baris:

     ```js
     if (isMuteKey(event)) return 'mute';
     ```

- Bukti selesai: perintah `node --test test/unit.input.test.mjs` → semua lulus, termasuk
  ketiga assertion baru di test `keyAction routes each key to the action main.js applies`;
  assertion ketiga (target tombol) itulah yang memaku `M` tidak digerbangi
  `isInteractiveTarget` — test `a serve key on a focused button is left to the browser`
  tetap hijau sebagai regresi serve (B4), tapi cakupannya hanya `Space`, jadi ia bukan
  bukti untuk `M`. Lalu `npm test` → 107 pass, 0 fail, exit 0 (jumlah test di titik ini
  tetap 107; yang bertambah assertion, bukan test — test pin cabang `main.js` baru lahir
  di Task 3).

### Task 3 — `src/main.js`: cabang dispatch `'mute'` (test-first, dengan pin teks)

- Berkas: `test/unit.input.test.mjs` (1 test pin baru), `src/main.js` (1 cabang).
- Prasyarat: Task 2.
- Langkah:
  1. Di `test/unit.input.test.mjs`, tambahkan `import { readFileSync } from 'node:fs';` di
     header impor dan satu test baru di akhir berkas. Pola baca-berkas sebagai teks sudah
     dipakai `test/unit.markup.test.mjs:13` dan `test/unit.sfx.test.mjs:109`, yang juga
     membaca `src/main.js`:

     ```js
     test('the mute branch in main.js dispatches toggle + syncMute', () => {
       const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
       assert.match(main, /action === 'mute'\)\s*\{[^}]*sfx\.toggle\(\);\s*syncMute\(\);/,
         'the mute branch calls sfx.toggle() then syncMute()');
     });
     ```

     Jalankan `node --test test/unit.input.test.mjs` → test baru merah (cabang belum ada);
     regex-nya terukur tidak cocok dengan teks mana pun di `src/main.js` pra-perubahan,
     jadi ia mengikat teks cabang, bukan kecocokan liar.
  2. Di handler `keydown` (baris 454-460), setelah baris 459
     (`else if (action === 'left' || action === 'right') ...`) tambah satu baris:

     ```js
     else if (action === 'mute') { sfx.toggle(); syncMute(); }
     ```

  Ini mengganti mute persis seperti klik tombol Mute (`src/main.js:64`), sehingga
  `sfx.muted`, `aria-pressed`, label (`syncMute`, baris 60-63), dan persist localStorage
  (`MUTE_KEY = 'breakout-3d.muted'`, `src/sfx.js:7,64`) ikut berubah. Tanpa `sfx.unlock()`
  tambahan: baris 456 (`if (action) sfx.unlock();`) sudah jalan untuk tiap aksi non-null
  sebelum dispatch. Tanpa `preventDefault`, tanpa cek modifier, tanpa gerbang
  `isInteractiveTarget`. Baris lain dan `keyup` tidak disentuh.
- Bukti selesai: `node --test test/unit.input.test.mjs` → test pin hijau; `npm test` → 108
  pass, 0 fail, exit 0 (107 baseline + 1 test pin). Pin gagal bila `syncMute()` hilang dari
  cabang, urutan panggilan terbalik, atau cabang `'mute'` tak lagi memanggil keduanya
  (terukur: teks cabang tanpa `syncMute()` tidak cocok); gerbang `isInteractiveTarget`
  yang menyelinap ke rute `M` ditangkap assertion ketiga Task 1. Efek runtime (label,
  `aria-pressed`, suara, persist setelah reload) tetap tak tertangkap otomatis — tak ada
  test yang menekan tombol, dan `tools/smoke.mjs` tak membaca teks kontrol (grep
  `hint|esc|controls` nol hasil) maupun mengirim `KeyboardEvent` (grep
  `dispatchEvent|KeyboardEvent` di repo nol hasil). Sisanya review diff dengan checklist:
  (1) cabang hanya memanggil `sfx.toggle()` dan `syncMute()`; (2) tidak ada
  `unlock`/`preventDefault`/modifier; (3) tidak ada baris lain berubah. Konfirmasi manual
  (opsional; bukan gate CI): `npm start`, tekan `M` → label `#mute` berganti
  `Mute`/`Unmute`, `aria-pressed` berbalik, suara mati/hidup, state bertahan setelah
  reload.

### Task 4 — Salinan kontrol: `README.md` dan hint `index.html`

- Berkas: `README.md`, `index.html`.
- Prasyarat: tidak ada (independen dari kode; kerjakan setelah Task 3 agar diff ringkas).
- Langkah:
  1. `README.md` baris 16 (Controls): setelah `- Pause: Esc` tambah baris `- Mute: M`.
  2. `README.md` baris 125-126 (Accessibility): `... Space/Enter serves, Esc pauses, and
     every control has a visible focus ring.` → sisipkan `M mutes` menjadi
     `... Space/Enter serves, Esc pauses, M mutes, and every control has a visible focus
     ring.`
  3. `index.html` baris 47: `... &middot; Esc = pause</p>` → `... &middot; Esc = pause
     &middot; M = mute</p>`.
  4. `README.md` baris 98: `npm test  # node --test, 107 checks, no browser` → `108
     checks` (Task 3 menambah satu test pin; baris 99 `37 checks` smoke tidak berubah).
  Tidak disentuh: Limitations `README.md:142` ("can be muted from the HUD" tetap benar),
  aria-label kanvas (`index.html:35`) dan teks overlay (`index.html:38`) tidak menyebut
  daftar kontrol, dua literal runtime `src/main.js:380`/`:384` (dipaku
  `test/unit.markup.test.mjs:58-64`).
- Bukti selesai: perintah `npm test` → test `every copy of the control text names touch,
  mouse and keyboard` (`test/unit.markup.test.mjs`) tetap hijau; test itu membaca
  `index.html` dan menuntut `drag`, `tap`, `A/D`, `arrow/←` ada di tiap salinan — token
  itu dipertahankan. README tak punya test (grep `readme` di `test/` nol), jadi
  verifikasi baca berkas: `sed -n '12,18p' README.md` (memuat `- Mute: M`),
  `sed -n '125,127p' README.md` (memuat `M mutes`), `sed -n '98p' README.md` (memuat
  `108 checks`), `sed -n '47p' index.html` (memuat `M = mute`).

### Task 5 — Verifikasi lingkup dan suite penuh

- Berkas: tidak ada yang diubah (verifikasi).
- Prasyarat: Task 4.
- Bukti selesai (perintah dari akar repo): `npm test` → 108 pass, 0 fail, exit 0 (107
  baseline + 1 test pin), termasuk test pin cabang `main.js`; `npm run smoke` → exit 0
  (butuh Chrome; di CI preinstalled; tak ada check smoke yang membaca teks kontrol);
  `git diff --name-only` → persis lima berkas implementasi di tabel (plan.md terpisah
  sebagai artefak baru); baca `git diff` → `keyup`, literal `src/main.js:380`/`:384`,
  aria-label kanvas, teks overlay, dan `package.json` tidak berubah.

## Risiko dan mitigasi

1. Merah hanya separuh. Di run merah hanya `on('KeyM')` yang terlapor gagal (node:test
   berhenti di assertion pertama yang gagal); `repeat` lulus karena `KeyM` pra-perubahan
   memang `null`, dan assertion target tombol tak tercapai walau juga `null` pra-perubahan
   (diprobe di ronde ini). Jangan menyimpulkan suite sudah hijau atau mengejar kegagalan
   kedua; ekspektasi ini ditulis di Task 1.
2. Guard repeat hilang. Bila `isMuteKey` ditulis tanpa `!event.repeat`, `M` yang ditahan
   membalik mute berulang. Mitigasi: assertion `on('KeyM', { repeat: true }) === null`
   menangkapnya setelah implementasi, plus review diff.
3. Dua jalur mute divergen. Cabang keyboard harus memanggil `sfx.toggle()` dan
   `syncMute()` — bukan salah satu — supaya audio, `aria-pressed`, label, dan persist
   cocok dengan klik tombol. Mitigasi: test pin `main.js` di Task 3 (gagal bila salah satu
   panggilan hilang atau urutan terbalik) + checklist review Task 3.
4. `M` dirampas dari konteks fokus. `M` sengaja tidak digerbangi `isInteractiveTarget`
   (mengikuti `Esc`); halaman ini hanya punya tombol, tak ada input teks, dan `M` tidak
   mengaktifkan tombol fokus secara native seperti `Space`/`Enter`, jadi tak ada
   double-fire. Mitigasi: keputusan sudah diambil spec; assertion ketiga Task 1 —
   `on('KeyM', { target: tombol fokus }) === 'mute'` — yang memaku `M` tak digerbangi;
   test `a serve key on a focused button is left to the browser` hanya menguji `Space`,
   jadi ia bukan bukti untuk `M`.
5. Drift salinan kontrol. Teks kontrol tersalin di `index.html` (hint) dan `README.md`
   (dua tempat); markup test menuntut token `drag`/`tap`/`A/D`/`arrow` di tiap salinan.
   Mitigasi: tiga titik sunting disebut persis di Task 4; `npm test` menangkap pelanggaran
   salinan hint.
6. Perilaku browser tanpa gate. Teks cabang kini dipaku test pin (Task 3), tapi efek
   runtime-nya (label/aria/localStorage saat reload) hanya terverifikasi review/manual —
   risiko regresi tak tertangkap otomatis, sama seperti cabang serve/pause. Mitigasi:
   checklist review + cek manual eksplisit di Task 3; jangan menambah berkas test di luar
   lima berkas (batas spec).
7. Nomor baris bergeser bila implementasi dimulai dari tree selain `839e61c`. Mitigasi:
   semua suntingan memakai jangkar teks yang dikutip; cek `grep -n` dulu bila ragu.

## Bukti selesai keseluruhan

Jalankan dari akar repo setelah semua task:

1. `npm test` → `# tests 108`, `# pass 108`, `# fail 0`, exit 0 (baseline `839e61c`
   terukur 107/0/exit 0; +1 test pin cabang di Task 3, jadi 108).
2. `npm run smoke` → exit 0; tak ada check smoke yang membaca teks kontrol; butuh Chrome
   (CI `.github/workflows/ci.yml` menjalankan `npm test` lalu `npm run smoke`).
3. `git diff --name-only` → lima berkas implementasi saja: `README.md`, `index.html`,
   `src/input.js`, `src/main.js`, `test/unit.input.test.mjs` (plus
   `docs/sdlc/mute-key/plan.md` sebagai artefak terpisah).
4. Tidak ada langkah lint/build di repo ini (skrip `package.json`: `start`, `test`,
   `smoke`, `screenshot`; situs statis tanpa bundel), jadi gate = 1-3.
5. Kriteria perilaku: `KeyM` → `'mute'`; ditahan → `null`; `KeyM` saat fokus di tombol →
   `'mute'` (tidak digerbangi `isInteractiveTarget`); cabang `src/main.js` memanggil
   `sfx.toggle()` + `syncMute()` tanpa unlock/`preventDefault` tambahan dan teksnya dipaku
   test pin; README Controls + Accessibility dan hint `index.html:47` menyebut `M`; tanpa
   dependency baru.
