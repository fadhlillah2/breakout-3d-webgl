# Spec: penjagaan modifier untuk tombol aksi dan penyeragaman teks kontrol jeda

Dibuat oleh: sdlc-spec; args root=. change=probe-par-fix; model pelaksana: deepseek-flash[1m];
2026-09-22; sha256 pendek: CLAUDE.md=tidak ada, REVIEW.md=tidak ada.

Rujukan intent: `docs/sdlc/probe-par-fix/intent.md` - "Status: diterima user 2026-09-22 -
keputusan grilling Q3 ("gas semua sesuai rekomendasi": tambal dua temuan review lewat
rantai, lalu PR squash)."

Spec ini menjawab APA yang dibangun, bukan bagaimana; urutan kerja milik plan.md.
Semua rujukan baris diukur pada tree branch `sdlc-probe-par`, HEAD
`6657541438fef1c5f7af1c4ff53564177ff7bc9d`, working tree bersih saat spec ditulis
(`git status --short` kosong; `npm test` dijalankan di HEAD ini). Label "definisi" =
tempat aturan dinyatakan, "pemakaian" = tempat aturan itu dijalankan.

## Konteks masalah

Sumber kedua temuan: `docs/sdlc/probe-par/review.md` (temuan bug+keamanan minor
`src/input.js:10`; temuan minor+nit `README.md:16` dan `index.html:47`).

- D1 (definisi, aturan tombol): `src/input.js:4-7` `isServeKey`, `:9-11` `isPauseKey`,
  `:13-15` `isMuteKey`. Tak satu pun memeriksa `ctrlKey`/`metaKey`/`altKey`; grep
  `ctrlKey|metaKey|altKey|shiftKey|modifier` di `src/`, `test/`, `tools/`: nol hasil.
- Pemakaian D1: `src/input.js:34-41` `keyAction` (satu-satunya pintu routing),
  dipakai `src/main.js:454-464` handler `keydown`: `preventDefault` serve di `:457`,
  `togglePause()` di `:458`, mute di `:460-463`. `src/main.js:456` memanggil
  `sfx.unlock()` untuk tiap aksi non-`null`.
- D2 (definisi, teks kontrol): tiga salinan teks kontrol - `README.md:16`
  ("- Pause: Esc"), `index.html:47` ("... &middot; Esc = pause &middot; M = mute"),
  dan literal overlay `src/main.js:380` ("Press Esc or P, or click or tap the button,
  to resume."). `README.md:126-127` sudah "Esc or P pauses"; `index.html:35`
  (aria-label kanvas) dan `index.html:38`/`src/main.js:384` tidak menyebut jeda, jadi
  tidak termasuk tiga salinan itu.
- Pemakaian D2: pin `test/unit.markup.test.mjs:15-27` menuntut tiap salinan memuat
  drag/tap/A\/D/arrow (tidak memaku teks jeda); pin `test/unit.markup.test.mjs:58-65`
  menuntut dua literal overlay tulisan `main.js` memuat tap dan `Esc|Space|Enter`.
  Tak ada test yang membaca `README.md` (grep `readme` di `test/` dan `tools/`: nol).

## Persyaratan teknis

- T1. Ketiga tombol aksi - serve (`Space`, `Enter`, `NumpadEnter`), pause (`Escape`,
  `KeyP`), mute (`KeyM`) - yang ditekan bersama Ctrl, Meta, atau Alt menghasilkan
  `keyAction` `null` (bukan aksi game, bukan pula `'native'`), sehingga browser
  memegang kombinasi itu sendiri.
- T2. Aturan modifier berlaku seragam untuk ketiga tombol aksi, bukan hanya pause;
  pemeriksaan ada di `src/input.js` (lapisan DOM-free), bukan di listener `main.js`.
- T3. Untuk serve bermodifier saat fokus ada di elemen interaktif, hasilnya tetap
  `null`: cabang `'native'` (`src/input.js:27-30, 35`) hanya berlaku untuk serve tanpa
  modifier. Konsekuensi yang diterima: `src/main.js:456` tidak memanggil `sfx.unlock()`
  dan `:457` tidak memanggil `preventDefault` untuk kombinasi bermodifier.
- T4. Shift bukan modifier: Shift+Space tetap `'serve'`, Shift+Escape/Shift+KeyP tetap
  `'pause'`, Shift+KeyM tetap `'mute'`.
- T5. Tanpa perubahan pada tombol paddle dan aturan repeat: `isLeftKey`/`isRightKey`
  tetap modifier-blind (Ctrl+A, Cmd+D, Alt+ArrowLeft tetap `'left'`/`'right'`), dan
  aturan "aksi tidak auto-repeat, paddle boleh repeat" (`src/input.js:1-2`) tidak
  berubah.
- T6. Ketiga salinan teks kontrol (D2) menyebut jeda sebagai "Esc or P": `README.md:16`
  dan `index.html:47` diubah; `src/main.js:380` sudah memenuhi dan tidak diubah. Sisa
  teks tiap salinan (movement, serve, mute, touch/mouse) tetap.
- T7. Tanpa dependency baru (`package.json` tetap tanpa `dependencies`/`devDependencies`);
  teks UI bahasa Inggris; tidak ada tombol, aksi, atau teks lain yang berubah.
- T8. Aturan baru T1-T5 dipaku assertion di `test/unit.input.test.mjs` mengikuti pola
  test `keyAction` yang ada (`:19-38`, helper `on()` di `:20`; assertion repeat di
  `:24-30`; test target interaktif di `:40-45`). Bila jumlah check berubah,
  `README.md:99` ("node --test, 108 checks") ikut diperbarui.
- T9. Berkas yang boleh berubah: `src/input.js`, `test/unit.input.test.mjs`,
  `README.md`, `index.html`, dan - hanya bila plan menambah pin - `test/unit.markup.test.mjs`.
  `src/main.js` tidak perlu dan tidak boleh berubah untuk temuan modifier (temuan 1
  selesai di `src/input.js`); `src/main.js:380` tetap apa adanya.

## Behavior yang diharapkan

- B1. Ctrl+P / Cmd+P / Alt+P: tidak menjeda; browser yang menangani (mis. dialog
  print di Ctrl+P/Cmd+P). Begitu pula Ctrl+M/Cmd+M/Alt+M tidak mengganti mute, dan
  Ctrl+Space/Ctrl+Enter/Alt+Space tidak serve.
- B2. Tanpa modifier, perilaku lama persis: Escape/KeyP → `'pause'`, KeyM → `'mute'`,
  Space/Enter/NumpadEnter → `'serve'` (`'native'` bila fokus di elemen interaktif),
  ArrowLeft/KeyA → `'left'`, ArrowRight/KeyD → `'right'`, KeyB → `null`.
- B3. Repeat tidak berubah: `repeat: true` pada Space/Escape/KeyP/KeyM → `null`;
  paddle dengan `repeat: true` tetap `'left'`/`'right'`.
- B4. Paddle tetap modifier-blind: Ctrl+A/Cmd+D/Alt+Arrow tetap menggerakkan paddle.
- B5. Shift tidak mengubah apa pun (T4), termasuk Shift+Space tetap serve.
- B6. Pemain yang membaca daftar Controls di README, hint in-page, atau layar jeda
  melihat tombol jeda yang sama - "Esc or P" - di ketiganya.
- B7. Tidak ada perubahan visual, audio, atau gameplay lain; `keyup`, `blur`, dan
  `visibilitychange` (`src/main.js:465-480`) tidak disentuh.

## Acceptance criteria

Tiap butir satu pemeriksaan; metode cek ada di butir itu.

- AC-1. `keyAction({ code: 'KeyP', repeat: false, ctrlKey: true })` (juga `metaKey`,
  `altKey`) mengembalikan `null`. Cek: assertion baru di `test/unit.input.test.mjs` (T8).
- AC-2. `keyAction({ code: 'KeyM', repeat: false, ctrlKey: true })` (juga `metaKey`,
  `altKey`) mengembalikan `null`. Cek: assertion baru di berkas yang sama.
- AC-3. `keyAction({ code: 'Space', repeat: false, ctrlKey: true, target: { closest: () => ({}) } })`
  mengembalikan `null` (bukan `'native'`), begitu pula `Enter`/`NumpadEnter` dan
  `altKey`/`metaKey`. Cek: assertion baru di berkas yang sama.
- AC-4. Shift bukan modifier: `on('Space', { shiftKey: true }) === 'serve'`,
  `on('KeyP', { shiftKey: true }) === 'pause'`, `on('KeyM', { shiftKey: true }) === 'mute'`.
  Cek: assertion baru di berkas yang sama.
- AC-5. Aturan lama tetap hijau persis: assertion `test/unit.input.test.mjs:25-37`
  (`Escape`, `KeyP`, `KeyM`, repeat, `KeyB`) dan `:40-45` (target interaktif tanpa
  modifier → `'native'`/`'serve'`) lulus tanpa diubah. Cek: `npm test`.
- AC-6. Paddle tetap modifier-blind: `on('ArrowLeft', { ctrlKey: true }) === 'left'`,
  `on('KeyD', { metaKey: true }) === 'right'`. Cek: assertion baru di berkas yang sama.
- AC-7. `README.md:12-18` memuat "Esc or P" pada baris jeda dan tetap memuat movement
  (mouse/touch/arrow/A-D), Serve, Mute. Cek: baca berkas (tak ada test yang membaca README).
- AC-8. `index.html:47` memuat "Esc or P" dan tetap memuat drag/tap/A\/D/arrow, jadi
  pin `test/unit.markup.test.mjs:15-27` lolos. Cek: baca berkas + `npm test`.
- AC-9. `src/main.js:380` tidak berubah ("Press Esc or P, or click or tap the button,
  to resume."), `README.md:126-127` tetap "Esc or P pauses", dan dua literal overlay di
  `src/main.js:380`/`:384` tetap lolos pin `test/unit.markup.test.mjs:58-65`. Cek:
  `git diff src/main.js` kosong + `npm test`.
- AC-10. `npm test` hijau: 0 fail, exit 0. Baseline terverifikasi di run ini pada HEAD
  `6657541`: `# tests 108`, `# pass 108`, `# fail 0`. Cek: jalankan `npm test`.
- AC-11. `npm run smoke` hijau bila Chrome tersedia; tak ada check smoke yang membaca
  teks kontrol (grep `Esc|Pause` di `tools/`: nol). Cek: jalankan `npm run smoke`
  (belum dijalankan di run ini; butuh `google-chrome`).
- AC-12. Diff hanya menyentuh berkas T9. Cek: `git diff --name-only` plus baca diff;
  `src/main.js` dan `package.json` tidak muncul.

## Kekhawatiran

- Kebijakan project: CLAUDE.md dan REVIEW.md tidak ada (`find` seluruh repo: nol hasil),
  jadi tidak ada kebijakan yang bertabrakan; rubrik bawaan yang dipakai review
  `docs/sdlc/probe-par/review.md:10` tetap berlaku untuk rantai ini.
- Dissent yang tercatat di DATA, sudah diputuskan: pass kepatuhan
  (`docs/sdlc/probe-par/review.md:78-84`) menilai pola tanpa-cek-modifier sebagai
  intended dan mengusulkan baris CLAUDE.md yang menyatakannya intended. Keputusan user
  di `intent.md` (diterima 2026-09-22) mengalahkannya: pemeriksaan modifier ditambal.
  Tidak dibuka lagi.
- Batas verifikasi browser: perilaku sebenarnya Ctrl+P/Cmd+P di browser tidak tertutup
  gate otomatis - tak ada `dispatchEvent`/`KeyboardEvent` di repo dan `tools/smoke.mjs`
  tidak mengirim event keyboard, jadi klaim tingkat browser hanya diverifikasi lewat
  `keyAction` (unit) dan review diff, seperti cabang aksi yang sudah ada.
- Hook `PreToolUse` `.claude/hooks/protect-tests.sh` memblokir edit berkas test saat
  `.claude/sdlc-phase` berisi "fix" (berkas penanda itu tidak ada saat spec ini ditulis,
  jadi hook inert). Assertion baru T8 harus ditulis di fase yang tidak memblokirnya;
  test yang dianggap salah dilaporkan di notes, bukan diubah.
- Umur pakai T2/T3: `sfx.unlock()` (`src/main.js:456`) kini tak dipanggil untuk
  kombinasi bermodifier - disengaja (jangan menyentuh audio saat pemain memakai
  pintasan browser), dicatat supaya tidak dilaporkan sebagai regresi.

## Asumsi

- AS-1. Modifier = Ctrl, Meta, Alt; Shift dikecualikan. Alt sudah diputuskan di
  `intent.md` ("Pertanyaan terbuka" pertama), bukan pertanyaan terbuka di sini.
- AS-2. Tree bersih di awal run; `git status --short` sempat melaporkan
  ` M test/unit.math.test.mjs` (mtime saja - `git diff --numstat` kosong), jadi tidak
  ada perubahan tak-terkait yang ikut terbawa dan AC-12 diukur terhadap HEAD.
- AS-3. Baseline gate: `npm test` 108 pass / 0 fail dijalankan di run ini pada HEAD
  `6657541`; `npm run smoke` belum dijalankan (butuh Chrome) - belum terverifikasi.
- AS-4. Menyalin literal "Esc or P" ke hint `index.html:47` tidak melanggar pin mana
  pun: pin `:15-27` hanya menuntut drag/tap/A\/D/arrow, pin `:58-65` hanya dua literal
  overlay `main.js` yang tidak diubah.
- AS-5. Ini rantai ketiga di branch `sdlc-probe-par`, merge ke `main` lewat PR squash
  (dari `intent.md`), semuanya di luar scope spec ini: spec tidak meminta commit, push,
  PR, atau deploy.

## Pertanyaan terbuka

- OQ-1. Bila plan menambah top-level test (bukan hanya assertion di test yang ada),
  jumlah check naik dari 108 dan `README.md:99` ("108 checks") menjadi kedaluwarsa;
  T8 menetapkan README ikut diperbarui, tetapi kalimat/wujudnya milik plan/build.
- OQ-2. Temuan review `docs/sdlc/probe-par/review.md:56-64` (sisa worktree/direktori
  untracked `.claude/worktrees/...`) tidak disebut `intent.md` sebagai bagian rantai
  ini; apakah lead ingin membersihkannya di run terpisah? Tidak dikerjakan di sini.

## Keputusan lead atas pertanyaan terbuka

- OQ-1: bila jumlah top-level test berubah, README baris "108 checks" ikut diperbarui oleh
  tugas dokumen di plan.md - diputuskan.
- OQ-2: sisa worktree dan direktori untracked sudah dibersihkan lead sesudah probe-par -
  diputuskan, bukan bagian rantai ini.

Status penerimaan: diterima lead 2026-09-22.

