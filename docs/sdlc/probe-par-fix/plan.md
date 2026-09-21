# Plan: penjagaan modifier untuk tombol aksi dan penyeragaman teks kontrol jeda

Dibuat oleh: sdlc-plan; args root=. change=probe-par-fix; model pelaksana:
deepseek-flash[1m]; 2026-09-22; sha256 pendek CLAUDE.md=tidak ada, REVIEW.md=tidak ada
(`find . -iname CLAUDE.md -o -iname REVIEW.md` di luar `.git` dan `node_modules`: nol hasil).

Rujukan dan status penerimaannya:

- `docs/sdlc/probe-par-fix/intent.md` - "Status: diterima user 2026-09-22 - keputusan
  grilling Q3 ("gas semua sesuai rekomendasi": tambal dua temuan review lewat rantai,
  lalu PR squash)."
- `docs/sdlc/probe-par-fix/spec.md` - "Status penerimaan: diterima lead 2026-09-22."

Basis pengukuran: branch `sdlc-probe-par`, HEAD `afdf7332e543889daed7dc75992a1572381fefad`,
working tree bersih saat plan ditulis (`git status --short` kosong). Tiga commit sesudah
HEAD yang dipakai spec (`6657541`) hanya menyentuh `.claude/hooks/protect-tests.sh`,
`.claude/settings.json`, `docs/sdlc/probe-par-fix/spec.md` (`git diff --name-only
6657541..HEAD`), jadi rujukan baris spec.md masih berlaku pada tree ini. Rentang commit
untuk tugas verifikasi T3: `afdf7332e543889daed7dc75992a1572381fefad..HEAD`.

Semua rujukan baris di bawah ini diukur pada tree itu; label "definisi" = tempat aturan
dinyatakan, "pemakaian" = tempat aturan dijalankan.

## Berkas yang berubah

- `src/input.js` (ada)
- `test/unit.input.test.mjs` (ada)
- `README.md` (ada)
- `index.html` (ada)

Tidak ada berkas baru. `src/main.js` dan `package.json` tidak disentuh (T9, AC-9, AC-12).

## Akar masalah

Definisi aturan tombol (`src/input.js:4-15`, `isServeKey`/`isPauseKey`/`isMuteKey`) tidak
memeriksa `ctrlKey`/`metaKey`/`altKey`, jadi pintu routing tunggal `keyAction`
(`src/input.js:34-41`, pemakaian) mengembalikan aksi game untuk Ctrl+P/Cmd+P/Ctrl+M dan
sejenisnya, padahal kombinasi itu milik browser. Teks kontrol juga punya tiga salinan dan
baru satu yang menyebut P: `README.md:16` "- Pause: Esc" dan `index.html:47`
("&middot; Esc = pause &middot;") belum, sementara `src/main.js:380` ("Press Esc or P, or
click or tap the button, to resume.") sudah.

## Urutan kerja

### T1 - kind: kode - penjagaan modifier di `keyAction`/predikat tombol aksi

Berkas: `src/input.js`, `test/unit.input.test.mjs`.
Prasyarat: tidak ada (satu-satunya tugas kode; T2 bergantung pada T1 - lihat R8).
Menutup: T1-T5, T8, AC-1..AC-6, B1-B5.

Langkah (test dulu - bukti merah sebelum implementasi, lalu hijau):

1. Tambahkan assertion baru di `test/unit.input.test.mjs` memakai helper `on()` yang sudah
   ada (test `keyAction routes each key to the action main.js applies`), dan satu assertion
   di test `a serve key on a focused button is left to the browser` (variabel `button` di
   sana sudah `{ closest: () => ({}) }`):

   ```js
   // Ctrl/Meta/Alt combos are the browser's (print, tab, menus), never ours.
   const actionKeys = ['Space', 'Enter', 'NumpadEnter', 'Escape', 'KeyP', 'KeyM'];
   for (const modifier of ['ctrlKey', 'metaKey', 'altKey']) {
     for (const code of actionKeys) {
       assert.equal(on(code, { [modifier]: true }), null, `${modifier}+${code} is not an action`);
     }
   }
   // Shift is not a modifier: it is ordinary typing, not a browser shortcut.
   assert.equal(on('Space', { shiftKey: true }), 'serve');
   assert.equal(on('Escape', { shiftKey: true }), 'pause');
   assert.equal(on('KeyP', { shiftKey: true }), 'pause');
   assert.equal(on('KeyM', { shiftKey: true }), 'mute');
   // The paddle stays modifier-blind: a held Ctrl+A still steers.
   assert.equal(on('ArrowLeft', { ctrlKey: true }), 'left');
   assert.equal(on('KeyD', { metaKey: true }), 'right');
   ```

   Daftar `actionKeys` sengaja memuat keenam kode tombol aksi, termasuk `Escape`: tanpa
   `Escape` di situ, implementasi yang menaruh guard hanya di cabang `KeyP` pada
   `isPauseKey` - cabang yang di-headline temuan review dan tempat alias baru ditambahkan -
   tetap lulus seluruh assertion versi lama (modifier hanya diuji pada `KeyP`, `KeyM`,
   `Space`, plus `Enter`-ctrl dan `NumpadEnter`-alt), dan `Escape` bermodifier terus
   memanggil `togglePause()` di `src/main.js:458`. Pernah dijalankan: guard penuh lulus 27
   assertion usulan ini, guard hanya-`KeyP` gagal pertama di `ctrlKey+Escape`
   (`null !== 'pause'`).

   dan di test target interaktif:

   ```js
   for (const code of ['Space', 'Enter', 'NumpadEnter']) {
     assert.equal(keyAction({ code, repeat: false, target: button, ctrlKey: true }), null,
       'a browser shortcut never becomes a native button activation');
   }
   ```

   Assertion baru masuk ke test yang sudah ada, bukan test top-level baru: jumlah test
   tetap 108 sehingga `README.md:99` ("node --test, 108 checks") tidak perlu berubah.
   Bila pelaksana menambah test top-level baru, `README.md:99` wajib diperbarui di T2
   (keputusan lead atas OQ-1).

2. Jalankan `node --test test/unit.input.test.mjs` - merah: assertion modifier gagal
   (`null !== 'serve'`/`'pause'`/`'mute'`, dan `null !== 'native'` untuk target interaktif
   bermodifier). Baris `Escape` bermodifier wajib terlihat gagal di sini (`null !==
   'pause'`): implementasi yang menaruh guard hanya di cabang `KeyP` tetap merah pada
   `ctrlKey+Escape`, jadi bukti merah yang tidak menyentuh `Escape` belum memadai. Catat
   kegagalan ini sebelum menyentuh sumber.

3. Implementasi minimal di `src/input.js`: satu helper modifier di samping predikat, lalu
   pakai di ketiga predikat aksi - bukan di `keyAction`, bukan di listener `main.js`:

   ```js
   // Ctrl/Meta/Alt combos belong to the browser (print, tab, menus). Shift is not a
   // modifier here: Shift+Space still serves.
   function isModified(event) {
     return Boolean(event.ctrlKey || event.metaKey || event.altKey);
   }

   function isServeKey(event) {
     if (event.repeat || isModified(event)) return false;
     return event.code === 'Space' || event.code === 'Enter' || event.code === 'NumpadEnter';
   }

   function isPauseKey(event) {
     return !event.repeat && !isModified(event) && (event.code === 'Escape' || event.code === 'KeyP');
   }

   function isMuteKey(event) {
     return !event.repeat && !isModified(event) && event.code === 'KeyM';
   }
   ```

   Sekalian perbarui komentar kepala berkas `src/input.js:1-2` agar menyebut aturan baru
   ("a Ctrl/Meta/Alt action key is the browser's, not ours"). Tidak ada perubahan lain di
   `src/input.js`: `isLeftKey`/`isRightKey` (`:17-23`) tetap modifier-blind (T5), cabang
   `'native'` (`:27-30`, `:35`) tidak berubah aturan - serve bermodifier jatuh ke `null`
   karena `isServeKey` sudah `false` (T3).

   Konsekuensi yang diterima dan sengaja: untuk kombinasi bermodifier `src/main.js:456`
   tidak memanggil `sfx.unlock()` dan `:457` tidak `preventDefault` (spec "Kekhawatiran");
   jangan dianggap regresi.

Cara membuktikan selesai:

- `node --test test/unit.input.test.mjs` - merah di langkah 2, hijau (`# fail 0`) sesudah
  langkah 3.
- `npm test` - `# tests 108`, `# pass 108`, `# fail 0`; test `keyAction routes each key to
  the action main.js applies` dan `a serve key on a focused button is left to the browser`
  lulus (AC-1..AC-6), dan test lama `:25-37`/`:40-45` lulus tanpa diubah (AC-5).
- Jangkar konten pada revisi ter-commit: `git show HEAD:src/input.js | grep -n "altKey"`
  menemukan tepat satu baris (helper guard); `git show HEAD:test/unit.input.test.mjs |
  grep -n "'NumpadEnter', 'Escape', 'KeyP', 'KeyM'"` menemukan satu baris (loop modifier
  menyentuh keenam kode aksi, `Escape` termasuk - guard hanya-`KeyP` tak bisa lulus);
  `git show HEAD:test/unit.input.test.mjs | grep -n "shiftKey"` menemukan empat baris
  (T4: Space, Escape, KeyP, KeyM).

### T2 - kind: dokumen - seragamkan teks kontrol jeda di README dan hint `index.html`

Berkas: `README.md`, `index.html`.
Prasyarat: T1, berurutan - bukan tugas paralel (R8). Berkasnya memang tidak beririsan
dengan T1, tetapi run paralel play build melepas tugas tanpa prasyarat ke worktree yang
bercabang dari default branch, dan itu merusak rantai ini.
Menutup: T6, AC-7, AC-8, B6.

Langkah:

1. `README.md:16` (bagian `## Controls`, definisi teks kontrol): "- Pause: Esc" menjadi
   "- Pause: Esc or P". Sisa daftar (`:14` movement, `:15` Serve, `:17` Mute, `:18` baris
   game over) tidak berubah, begitu pula `README.md:126-127` yang sudah "Esc or P pauses".
2. `index.html:47` (hint, atribut `class="hint"`): potongan "Esc = pause" menjadi
   "Esc or P = pause"; seluruh sisa teks hint tetap, termasuk drag/mouse/A/D/←/tap/click/
   Space/M, supaya pin `test/unit.markup.test.mjs:15-27` (drag, tap, A\/D, arrow) tetap
   lolos. Jangan menyentuh `index.html:35` (aria-label kanvas, tidak menyebut jeda),
   `index.html:36-40` (overlay) dan `src/main.js:380`/`:384` (T9, AC-9).
3. Bila T1 menambah test top-level baru (bukan hanya assertion di test yang ada),
   perbarui `README.md:99` - baris "npm test # node --test, 108 checks" - ke jumlah check
   baru pada tugas ini juga.

Cara membuktikan selesai:

- `git show HEAD:README.md | grep -n "Pause: Esc or P"` menemukan satu baris, dan
  `git show HEAD:README.md | grep -n "Move the paddle\|Serve: Space / Enter / click / tap\|Mute: M"` 
  menemukan tiga baris sisa yang tidak berubah (AC-7; tak ada test yang membaca README -
  `grep -rni readme test/ tools/`: nol hasil, jadi cek ini memang cek baca-berkas).
- `git show HEAD:index.html | grep -n "Esc or P"` menemukan satu baris, yaitu `:47`
  (AC-8).
- `npm test` - `test/unit.markup.test.mjs` hijau (pin tiga salinan teks kontrol dan pin
  dua literal overlay `src/main.js` tetap lolos).

### T3 - kind: verifikasi - gerbang keseluruhan pada revisi ter-commit

Berkas: tidak ada (tidak mengubah apa pun).
Prasyarat: T1, T2 (keduanya sudah di-commit play build).
Menutup: AC-10, AC-11, AC-12, plus cek ulang AC-7/AC-8/AC-9 pada rentang commit.

Cara membuktikan selesai (semua pada rentang commit, bukan `git status`/working tree):

- `npm test` - `# tests 108`, `# pass 108`, `# fail 0`, exit 0 (baseline dijalankan di run
  plan ini pada HEAD `afdf733`: 108/108/0).
- `npm run smoke` - "all smoke checks passed" (baseline dijalankan di run plan ini pada
  HEAD `afdf733`: lulus; `google-chrome` tersedia di PATH (`command -v google-chrome`
  mengembalikan sebuah path)).
- `git diff --name-only afdf7332e543889daed7dc75992a1572381fefad..HEAD` hanya memuat
  `src/input.js`, `test/unit.input.test.mjs`, `README.md`, `index.html`, plus artefak
  `docs/sdlc/probe-par-fix/`; `src/main.js` dan `package.json` tidak muncul (AC-12).
- `git diff afdf7332e543889daed7dc75992a1572381fefad..HEAD -- src/main.js` kosong (AC-9).
- `git grep -n "Press Esc or P, or click or tap the button, to resume\." HEAD -- src/main.js`
  menemukan satu baris (AC-9, literal overlay tidak bergeser).
- `git grep -n "Esc or P" HEAD -- README.md index.html` menemukan tiga baris -
  `README.md:16` ("- Pause: Esc or P"), `README.md:127` (Accessibility, "Esc or P pauses"),
  dan `index.html:47` ("Esc or P = pause"). Angka dua berarti salah satu suntingan T2
  meleset (mis. `:127` ikut tersunting), dan tak ada gate lain yang menangkapnya:
  `npm test` dan `npm run smoke` tidak membaca README (AC-7, AC-8).
- `git grep -n "Esc or P pauses" HEAD -- README.md` menemukan tepat satu baris, yaitu
  `README.md:127` - jangkar untuk klausa AC-9 "README.md:126-127 tetap Esc or P pauses",
  yang tidak disentuh T2 dan tidak dibaca gate mana pun selain grep ini.

Celah bernama: dialog print Ctrl+P/Cmd+P di browser - B1/AC-1 sampai AC-3 tidak punya
gate tingkat browser: tak ada `dispatchEvent`/`KeyboardEvent` di repo dan `tools/smoke.mjs`
tidak mengirim event keyboard (`grep -rn "Esc" tools/`: nol hasil), jadi perilaku browser
hanya tercakup unit test `keyAction` plus review diff.

Celah bernama: teks kontrol yang terlihat pemain di halaman - tak ada gate yang membaca
teks hint dari DOM (pin `test/unit.markup.test.mjs` hanya menuntut drag/tap/A\/D/arrow,
tidak memaku salinan jeda; `npm run smoke` tidak memeriksa teks kontrol), jadi AC-8
bertumpu pada cek `git grep` di atas.

## Risiko dan mitigasi

- R1 - Hook `PreToolUse` `.claude/hooks/protect-tests.sh` memblokir (exit 2) perubahan
  berkas test saat `.claude/sdlc-phase` berisi "fix". Saat plan ini ditulis berkas penanda
  itu tidak ada (isi `.claude/`: `hooks/`, `settings.json`) sehingga hook inert, dan
  assertion T1 ditulis di fase build. Mitigasi: bila fase "fix" ternyata aktif, jangan
  menonaktifkan hook atau mengubah test yang ada - laporkan di notes.
- R2 - Guard ditaruh di `keyAction` atau di listener `main.js` akan mematikan paddle
  bermodifier (Ctrl+A/Ctrl+D berhenti menggerakkan), melanggar T5/B4 dan AC-6. Mitigasi:
  guard hanya di tiga predikat aksi; AC-6 memakunya sebagai assertion.
- R3 - Guard yang memakai `event.shiftKey` merusak T4 (Shift+Space wajib tetap serve).
  Mitigasi: assertion `shiftKey` di T1 memakunya.
- R4 - `sfx.unlock()` tidak lagi dipanggil untuk kombinasi bermodifier; spec sudah
  menandainya disengaja. Mitigasi: dicatat di T1 supaya tidak dilaporkan sebagai regresi
  oleh review.
- R5 - Jumlah check `README.md:99` jadi kedaluwarsa bila pelaksana menambah test top-level
  (OQ-1). Mitigasi: T1 memilih assertion di test yang ada (tetap 108); bila tetap ditambah
  top-level test, `README.md:99` diperbarui di T2 pada commit yang sama.
- R6 - `npm run smoke` butuh Chrome; ia lulus di environment ini, tapi worktree lain bisa
  tidak punya browser. Mitigasi: jalankan di checkout utama dan laporkan hasilnya di notes;
  jangan menghapus gate dari daftar keseluruhan.
- R7 - Teks hint `index.html` diubah: regresi terjadi bila potongan lain ikut terhapus
  sehingga pin markup gagal. Mitigasi: `npm test` (pin `test/unit.markup.test.mjs:15-27`)
  dijalankan sesudah T2.
- R8 - Run paralel play build (`parallel: true`) melepas tugas tanpa prasyarat ke worktree
  yang bercabang dari default branch, bukan dari branch kerja. T1 menyunting baris
  `src/input.js:10` (`isPauseKey`) - baris yang sama sudah diubah branch kerja terhadap
  default (`git diff main..HEAD -- src/input.js`: satu baris) - jadi merge hasil worktree
  T1 konflik; play build membatalkan merge itu dan tidak menjalankan tugas berurutan
  sesudahnya, termasuk T3, sehingga run berakhir status gate. Mitigasi: T2 ditulis
  bergantung pada T1 (T2 `Prasyarat: T1`) supaya seluruh rantai berjalan berurutan inline
  di branch kerja; bila run tetap ingin paralel, setel `worktree.baseRef=head` lebih dulu,
  dan konflik itu sendiri terverifikasi lewat simulasi `git merge-file` dengan isi berkas
  asli (exit 1, conflict marker pada baris tersebut), bukan lewat worktree/merge sungguhan.

## Cara membuktikan selesai keseluruhan

- `npm test`
- `npm run smoke`

Keduanya dijalankan pada revisi ter-commit; baseline keduanya hijau di run plan ini pada
`afdf733`. `npm run screenshot` tidak dijalankan: tidak ada perubahan visual - `body.shot`
menyembunyikan hint (`style.css:98`), dan `style.css` serta `src/gl.js` tidak disentuh.

Adjudikasi lead atas gate run plan (`wf_abd309c8-b57`, 2 ronde, 1 material tersisa di daftar
run): temuan "Escape tidak diuji bermodifier" sudah tertutup oleh perbaikan ronde 2 - daftar
`actionKeys` memuat `Escape` dan Shift+Escape diuji - jadi tidak ada material tersisa; 17
minor dibiarkan (rumusan hitungan commit, kosakata hook, ekspektasi jumlah baris grep).

Status penerimaan: diterima lead 2026-09-22.

