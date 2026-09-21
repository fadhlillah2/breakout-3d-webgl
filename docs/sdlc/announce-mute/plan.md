# Plan: umumkan mute/unmute dari keyboard ke live region

Rujukan: `docs/sdlc/announce-mute/intent.md` (commit `13f2f99`, diterima user 2026-09-21)
dan `docs/sdlc/announce-mute/spec.md` (commit `f91fa2d`). Baseline di tree ini (branch
`sdlc-announce`, HEAD `f91fa2d`, bersih): `npm test` → 108 pass, 0 fail, exit 0
(node v20.19.6); `npm run smoke` → exit 0, "all smoke checks passed"; google-chrome ada
di `/usr/bin/google-chrome`. Plan ini memuat seluruh yang dibutuhkan implementasi;
intent.md dan spec.md tidak perlu dibuka lagi.

## Akar masalah

Cabang keyboard mute `src/main.js:460` (`else if (action === 'mute') { sfx.toggle();
syncMute(); }`) hanya mengubah state tombol `#mute`: `syncMute` (`:60-63`) menyetel
`aria-pressed` dan label; live region tunggal `#announce` (`:43`, `index.html:48`) tidak
ditulis di jalur itu. Semua penulisan `announce` yang ada berada di jalur lain (`:406-409`,
`:420`, `:525`, `:539`). Pemain screen reader yang fokus di kanvas menekan `M` tanpa umpan
balik. Perbaikan minimal: satu statement tambahan di cabang itu, sesudah `syncMute()`,
dengan guard fokus.

## Perilaku yang diminta (dari spec)

- B1. `M` saat fokus bukan di `#mute`: state berubah persis seperti sekarang, lalu
  `#announce` berisi `Sound muted.` (jadi mute) atau `Sound on.` (unmute).
- B2. `M` saat fokus di `#mute`: state tetap berubah, `#announce` tidak berubah.
- B3. Klik tombol `#mute`: state berubah, `#announce` tidak berubah.
- B4. Pengumuman lain (nyawa/level/game over, restart, WebGL hilang/pulih) tidak berubah.
- B5. Perilaku mute sendiri (`sfx.muted`, `aria-pressed`, label, persist localStorage)
  tidak berubah.
- B6. `README.md:128-129` menyatakan mute dari keyboard ikut diumumkan.

## Berkas yang berubah

| Path                              | Status | Perubahan |
| --------------------------------- | ------ | --------- |
| `test/unit.input.test.mjs`        | ada    | pin `:45-49` diperluas (Task 1) |
| `src/main.js`                     | ada    | cabang mute `:460` jadi empat baris (Task 2) |
| `README.md`                       | ada    | kalimat live region `:129` (Task 3) |
| `docs/sdlc/announce-mute/plan.md` | baru   | rencana ini (artefak; bukan diff implementasi) |

Aturan test-first (play build): Task 1 menulis dan menjalankan pin merah lebih dulu; Task 2
jangan dimulai sebelum keluaran merah tercatat di bagian "Bukti merah". Task 3 tak punya
test (tak ada test yang membaca README; terukur), jadi dikerjakan setelah Task 2.

## Urutan kerja

### Task 1 — Perluas pin cabang mute (merah lebih dulu)

- Berkas: `test/unit.input.test.mjs` (mengganti isi test `:45-49`; tetap satu test, bukan
  test baru — jumlah test tetap 108).
- Prasyarat: tidak ada.
- Langkah: ganti test `the mute branch in main.js dispatches toggle + syncMute` (baris
  45-49) dengan tepat:

```js
test('the mute branch in main.js toggles, syncs and announces', () => {
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8')
    .replace(/^\s*\/\/.*$/gm, ''); // a commented-out statement must not satisfy the pin
  assert.match(main, /action === 'mute'\)\s*\{[^}]*sfx\.toggle\(\);\s*syncMute\(\);\s*if \(document\.activeElement !== muteButton\)\s*\{?\s*announce\.textContent = sfx\.muted \? 'Sound muted\.' : 'Sound on\.';/,
    'the mute branch calls sfx.toggle() then syncMute() then writes #announce unless #mute has focus');
});
```

  Baris `assert.match` sengaja satu baris utuh (literal regex tak bisa dipotong) — jangan
  dirapikan. Regex menuntut kontrak perilaku cabang, bukan formatnya: urutan
  `sfx.toggle()` → `syncMute()`, guard `document.activeElement !== muteButton`, dan
  penulisan `announce.textContent =` dengan dua literal; kurung kurawal guard opsional
  (`\{?`) dan layout satu atau multi-baris sama-sama cocok. Baris komentar penuh dibuang
  sebelum pencocokan supaya pernyataan yang di-comment tidak memuaskan pin. Diprobe di
  plan ini terhadap tree `f91fa2d`: tidak cocok dengan teks sekarang (merah dijamin),
  cocok dengan bentuk Task 2, dan tidak cocok bila guard hilang, guard dibalik, urutan
  dibalik, atau literal ditukar.

- Bukti selesai (dijalankan sebelum menyunting `src/main.js`):
  1. `node --test test/unit.input.test.mjs` → exit non-zero; 3 pass, 1 fail; test
     `the mute branch in main.js toggles, syncs and announces` gagal `AssertionError`
     (`ERR_ASSERTION`) dengan pesan `the mute branch calls sfx.toggle() then syncMute()
     then writes #announce unless #mute has focus`.
  2. `npm test` → `# tests 108`, `# pass 107`, `# fail 1`, exit non-zero (AC-1: suite
     merah sebelum cabang diubah).

  Tempel keluaran `npm test` ke bagian "Bukti merah" di bawah, lalu lanjut Task 2.

### Task 2 — `src/main.js`: perluas cabang mute

- Berkas: `src/main.js` (hanya baris 460).
- Prasyarat: Task 1 (pin merah sudah dijalankan dan dicatat).
- Langkah: ganti baris 460

```js
    else if (action === 'mute') { sfx.toggle(); syncMute(); }
```

  dengan empat baris berikut (indentasi persis seperti tertulis; brace-free if):

```js
    else if (action === 'mute') {
      sfx.toggle(); syncMute();
      if (document.activeElement !== muteButton) announce.textContent = sfx.muted ? 'Sound muted.' : 'Sound on.';
    }
```

  - Guard fokus: pengumuman dilewati saat fokus di `#mute` karena di situ `syncMute()`
    sudah mengubah `aria-pressed` tombol yang fokus (T5/B2; klaim AS-2).
  - `sfx.muted` dibaca sesudah `sfx.toggle()`, jadi jadi-mute → `'Sound muted.'`,
    unmute → `'Sound on.'` (T6).
  - Konsekuensi tampilan (diterima): `#announce` bukan kanal khusus screen reader; ia
    baris `.status` yang terlihat di layar (`index.html:48`, `style.css:68`), jadi teks
    mute juga tampil bagi pemain awas dan menggantikan pesan status yang sedang tampil
    (mis. `Life lost. 2 remaining.` atau `Game over. Score N.`) saat `M` ditekan. Tak
    ada gate otomatis yang melihat sisi ini: smoke tak menekan `M`; screenshot
    menyembunyikannya (`body.shot .status`, `style.css:98`); pin Task 1 hanya membaca
    teks `src/main.js`. Spec T2/T3 mengunci region yang ada tanpa elemen baru, jadi
    efek visual ini diterima sebagai konsekuensi yang diketahui.
  - Tanpa `preventDefault`; tanpa `sfx.unlock()` tambahan (`:456` sudah jalan untuk tiap
    aksi non-null); `syncMute` (`:60-63`) dan listener klik (`:64`) tidak diubah — klik
    tetap senyap di region (T4/B3); `keyup` (`:462-465`) tidak disentuh (AC-5).
  - Baris if baru 113 karakter, sejajar baris panjang yang sudah ada (`:451` 113,
    `:598` 122). Guard sengaja brace-free mengikuti pola `:406-407`; blok `{ ... }` atau
    ternary terpenggal membuat pin Task 1 tetap merah.

- Bukti selesai: `node --test test/unit.input.test.mjs` → 4 pass, 0 fail (pin hijau);
  lalu `npm test` → `# tests 108`, `# pass 108`, `# fail 0`, exit 0. Efek runtime (teks
  dibaca screen reader, syarat fokus) tak tertangkap otomatis — tak ada test DOM dan tak
  ada `dispatchEvent`/`KeyboardEvent` di repo (grep nol hasil); sisanya review diff AC-3:
  (1) dua literal Inggris ada, (2) kondisi `document.activeElement` ada, (3) urutan
  `sfx.toggle()` → `syncMute()` → penulisan `announce`.

### Task 3 — `README.md`: satu kalimat live region

- Berkas: `README.md` (hanya baris 129).
- Prasyarat: tidak ada (kerjakan setelah Task 2 agar diff ringkas).
- Langkah: ganti baris 129

  `  a lost life, a new level and the final score.`

  dengan

  `  a lost life, a new level, the final score, and a keyboard mute toggle.`

  Baris 128 dan sisanya tidak disentuh. Sengaja tidak diubah: `:99` (`108 checks` — pin
  diperluas, bukan test baru), `:100` (`37 checks` smoke), `:126-127` (sudah memuat
  `M mutes`).

- Bukti selesai: tak ada test yang membaca README (`grep -rin readme test/` nol hasil,
  terukur); jalankan `grep -n 'keyboard mute toggle' README.md` → baris 129; baca
  `sed -n '128,129p' README.md`; `npm test` tetap 108 pass, 0 fail, exit 0.

### Task 4 — Verifikasi lingkup penuh (gate akhir)

- Berkas: tidak ada yang diubah (verifikasi).
- Prasyarat: Task 1-3.
- Bukti selesai (perintah dari akar repo):
  1. `npm test` → `# tests 108`, `# pass 108`, `# fail 0`, exit 0.
  2. `npm run smoke` → exit 0, "all smoke checks passed" (37 pemanggilan check();
     butuh Chrome; CI `.github/workflows/ci.yml:24-27` menjalankan `npm test` lalu
     `npm run smoke`).
  3. `git diff --name-only` → persis `README.md`, `src/main.js`,
     `test/unit.input.test.mjs`; `git status --short` juga menampilkan
     `?? docs/sdlc/announce-mute/plan.md`.
  4. `git diff src/main.js` → hanya cabang mute (AC-5). `grep -n announce src/main.js` →
     tepat satu kemunculan baru, dan ia di dalam cabang mute (di antara
     `action === 'mute'` dan akhir handler `keydown`); kemunculan lain tetap yang sudah
     ada di baseline (deklarasi, `syncStatus`, restart, context lost/restored) — nomor
     baris tidak dipaku karena layout cabang bebas; `syncMute` dan listener klik tetap
     tanpa `announce` (AC-4).
  5. Checklist review AC-3 atas `git diff src/main.js` (lihat Task 2).

  Tidak ada langkah lint/build di repo ini (skrip `package.json`: `start`, `test`,
  `smoke`, `screenshot`; situs statis tanpa bundel) — gate = butir 1-5.

## Risiko dan mitigasi

1. Laporan merah separuh. `node:test` melaporkan 107 pass/1 fail; satu-satunya kegagalan
   harus test pin. Bila ada kegagalan lain, tree bukan baseline `f91fa2d` — berhenti dan
   periksa, jangan mengejar.
2. Bentuk cabang melenceng dari pin. Pin menuntut guard brace-free dan ternary satu
   baris; blok `{ ... }` atau ternary terpenggal membuat pin merah walau perilaku benar.
   Mitigasi: tempel persis teks Task 2; jangan merapikan baris panjang di pin.
3. Kata OQ-1 berubah saat penerimaan spec. Bila user mengganti `Sound muted.`/`Sound on.`,
   ubah literal di `src/main.js` dan di pin Task 1 bersamaan, lalu ulangi merah → hijau
   (spec AC-1).
4. AS-2 keliru. Klaim screen reader mengumumkan sendiri `aria-pressed` tombol yang fokus
   belum diverifikasi; ia dasar B2/B3. Bila keliru, jalur klik dan `M` saat fokus di
   tombol juga butuh pengumuman (OQ-2) — perluasan scope di luar plan ini; jangan
   tambahkan sekarang.
5. Klaim README lebih luas dari kasus fokus-tombol. Kalimat `:129` menyebut mute keyboard
   diumumkan; saat fokus di `#mute` region sengaja diam (tombol yang berbicara, AS-2).
   Kata mengikuti spec T8; bila AS-2 keliru, OQ-2 menutupnya.
6. Nomor baris bergeser. Semua suntingan memakai jangkar teks yang dikutip; rujukan baris
   di plan ini diukur di `f91fa2d`; cek `grep -n` dulu bila ragu.

## Bukti selesai keseluruhan

1. `npm test` → `# tests 108`, `# pass 108`, `# fail 0`, exit 0 (baseline terukur
   108/0/exit 0; di jendela Task 1 suite merah 107/1 sebagai bukti pin mengikat).
2. `npm run smoke` → exit 0, "all smoke checks passed" (baseline terukur exit 0; smoke
   tidak menekan `M`).
3. `git diff --name-only` → tiga berkas implementasi saja; `plan.md` untracked terpisah.
4. Pemetaan acceptance: AC-1 → Task 1 + Task 2; AC-2 → Task 2; AC-3 → Task 2/4 (checklist
   review); AC-4, AC-5 → Task 4 butir 4; AC-6 → Task 4 butir 3; AC-7 → Task 3; AC-8 →
   Task 4 butir 2.

## Bukti merah (diisi pelaksana Task 1, sebelum Task 2)

- Keluaran `npm test` merah (harus 107 pass, 1 fail, `ERR_ASSERTION` pada test pin):

```
# Subtest: the mute branch in main.js toggles, syncs and announces
not ok 85 - the mute branch in main.js toggles, syncs and announces
  ---
  duration_ms: 7.566941
  location: '/home/finskor017/Documents/PROJECTS/breakout-3d-webgl/test/unit.input.test.mjs:45:1'
  failureType: 'testCodeFailure'
  error: 'the mute branch calls sfx.toggle() then syncMute() then writes #announce unless #mute has focus'
  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  ...
[dipotong: diagnostik expected/actual = dump teks src/main.js +-600 baris]
1..108
# tests 108
# suites 0
# pass 107
# fail 1
# cancelled 0
# skipped 0
# todo 0
# duration_ms 653.73186
```

  Exit 1; stdout `npm test` penuh 1169 baris - dipotong ke blok kegagalan + ringkasan.
  `node --test test/unit.input.test.mjs` juga merah: 3 pass, 1 fail, `ERR_ASSERTION`
  yang sama, exit 1 (node v20.19.6, dijalankan sebelum `src/main.js` disentuh).
