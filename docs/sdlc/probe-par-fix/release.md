# Release: penjagaan modifier tombol aksi dan penyeragaman teks kontrol jeda

Dibuat oleh: sdlc-deploy release; args root=. change=probe-par-fix base=main (rentang rilis
`0fb320f..HEAD`); model pelaksana: deepseek-flash[1m]; 2026-09-22; CLAUDE.md=tidak ada,
REVIEW.md=tidak ada.

Run ini read-only selain berkas ini: PR, push, tag, dan deploy tidak dilakukan - semuanya
gate manusia.

## PR

Judul (72/72 karakter):

    Guard action keys against modifiers and unify the pause text as Esc or P

Body:

```markdown
### Apa dan mengapa

Dua temuan `docs/sdlc/probe-par/review.md` ditambal dalam satu rantai
(`docs/sdlc/probe-par-fix/intent.md`):

1. Predikat tombol aksi di `src/input.js` (`isServeKey`, `isPauseKey`, `isMuteKey`) tidak
   memeriksa modifier, jadi Ctrl+P / Cmd+P (print browser), Ctrl+M, dan kombinasi modifier
   lain ikut dirutekan ke aksi game padahal browser punya arti sendiri untuk kombinasi itu.
2. Teks kontrol tidak konsisten sesudah `P` jadi alias jeda: README bagian Controls masih
   "Pause: Esc" dan hint `index.html` masih "Esc = pause", sementara overlay jeda dan README
   bagian Accessibility sudah menyebut "Esc or P".

Yang diinginkan: tombol aksi (serve, pause, mute) yang ditekan bersama Ctrl, Meta, atau Alt
tidak menjadi aksi game (`keyAction` mengembalikan `null`, biarkan browser), tanpa mengubah
perilaku tombol paddle dan aturan repeat; dan ketiga salinan teks kontrol menyebut jeda
sebagai "Esc or P". Shift bukan modifier (Shift+Space tetap serve).

Rentang ini (`0fb320f..HEAD`) berisi satu commit squash, `89c3ce5` "Add P as a pause alias
and guard action keys against modifiers (#3)", yang sudah ada di `main` dan `origin/main`;
commit-commit antara rantai ini ada di branch `sdlc-probe-par`, bukan di rentang.

### Acceptance criteria dan bukti

Semua diukur pada revisi rilis `89c3ce5`; "npm test"/"probe" bertanda (run ini) dijalankan
di run rilis ini.

- AC-1 / AC-2. `keyAction` untuk `KeyP`/`KeyM` dengan `ctrlKey`, `metaKey`, atau `altKey`
  mengembalikan `null`. Bukti: assertion loop di `test/unit.input.test.mjs:39-44` (3 modifier
  x 6 kode aksi) + probe node (run ini): 18/18 kombinasi `null`, 0 non-null; `npm test`
  108/108/0.
- AC-3. Serve bermodifier pada target interaktif mengembalikan `null`, bukan `'native'`.
  Bukti: probe node (run ini): 9/9 kombinasi (3 modifier x `Space`/`Enter`/`NumpadEnter` pada
  `{ closest: () => ({}) }`) -> `null`. Catatan: test hanya memaku varian `ctrlKey`
  (`test/unit.input.test.mjs:60-63`) - lihat temuan review no. 5.
- AC-4. Shift bukan modifier. Bukti: `test/unit.input.test.mjs:46-49` + probe (run ini):
  `Space`+shift -> `'serve'`, `Escape`/`KeyP`+shift -> `'pause'`, `KeyM`+shift -> `'mute'`.
- AC-5. Aturan lama tetap hijau tanpa diubah. Bukti: `npm test` (run ini) -> `# tests 108`,
  `# pass 108`, `# fail 0`, exit 0; test `src/input.js` lulus semua.
- AC-6. Paddle tetap modifier-blind. Bukti: `test/unit.input.test.mjs:52-53` + probe (run
  ini): `ArrowLeft`+ctrl -> `'left'`, `KeyD`+meta -> `'right'`, `KeyA`+ctrl -> `'left'`,
  `ArrowRight`+alt -> `'right'`.
- AC-7. `README.md` Controls memuat "Esc or P". Bukti: `git grep -n "Esc or P" HEAD --
  README.md` -> `README.md:16` ("- Pause: Esc or P") dan `README.md:127`; tidak ada test yang
  membaca README (celah bernama di `docs/sdlc/probe-par-fix/plan.md`).
- AC-8. Hint `index.html` memuat "Esc or P". Bukti: `git grep -n "Esc or P" HEAD --
  index.html` -> `index.html:47`; pin `test/unit.markup.test.mjs` (drag/tap/A-D/arrow) hijau
  di `npm test` (run ini).
- AC-9. Literal overlay `src/main.js:380` ("Press Esc or P, or click or tap the button, to
  resume.") dan `README.md:127` tetap. Bukti: `git grep` di HEAD -> `src/main.js:380` satu
  baris; diff `src/main.js` kosong terhadap basis rantai fix `afdf733`. Terhadap `0fb320f`
  `src/main.js` berubah satu baris - baris overlay itu sendiri, dari rantai alias P.
- AC-10. `npm test` hijau. Bukti (run ini): `# tests 108`, `# pass 108`, `# fail 0`, exit 0.
- AC-11. `npm run smoke` hijau. Bukti (run ini): 37 cek `ok`, "all smoke checks passed",
  exit 0; `google-chrome` ada di `/usr/bin/google-chrome`.
- AC-12. Diff hanya berkas yang diizinkan. Bukti (run ini): `git diff --name-only
  0fb320f..HEAD` -> 15 berkas; `package.json` tidak muncul; `src/main.js` muncul (satu baris
  overlay dari rantai alias P); `.claude/hooks/protect-tests.sh` + `.claude/settings.json`
  ikut di luar daftar T9 - temuan review no. 7.

Screenshot: tidak ada AC screenshot. `npm run screenshot` tidak dijalankan karena tidak ada
perubahan visual - `git diff --name-only 0fb320f..HEAD -- screenshots/ style.css src/gl.js`
kosong (run ini).

### Commit di rentang 0fb320f..HEAD

    $ git log --oneline 0fb320f..HEAD
    89c3ce5 Add P as a pause alias and guard action keys against modifiers (#3)

Satu commit squash (single-parent, parent `0fb320f`), sudah ada di `main` dan `origin/main`.
Isinya juga membawa kerja alias jeda `P` (branch `sdlc-probe-par`) yang memperkenalkan
ketidakkonsistenan teks yang dibereskan di rantai ini.

### Ringkasan review (docs/sdlc/probe-par-fix/review.md)

Diff yang direview: `main` -> `479908f` (branch `sdlc-probe-par`); 8 temuan terkonfirmasi
(7 minor, 1 nit), 7 terbantah, 0 belum dibantah. Disposisi di bawah adalah keadaan pada
revisi rilis `89c3ce5`, diukur di run rilis ini - bukan klaim perbaikan oleh review.

1. [bug minor] `protect-tests.sh` menghitung `2>&1`/`>&2` sebagai penulisan berkas test.
   Tertutup: hook ditulis ulang sebelum squash (commit `9987a74`, parser python); probe run
   ini - perintah baca-saja dengan `2>&1` dan `>&2` -> exit 0.
2. [bug minor] Penulisan berkas test lewat `git apply`/interpreter lolos dari hook. Masih
   terbuka: probe run ini - `git apply --include=test/unit.input.test.mjs` -> exit 0,
   `python3 -c` write -> exit 0, sementara kontrol `printf x > test/...` dan Edit tool ->
   exit 2.
3. [bug minor] Tanpa `jq` hook gagal-terbuka. Premisnya hilang di revisi rilis (hook memakai
   `python3`, tidak ada `jq`); kelas yang sama tetap ada - tanpa `python3` di PATH hook keluar
   127 (bukan 2) dan tidak ada `command -v python3`/`set -e` (probe run ini).
4. [keamanan minor] `.claude/settings.json` menjalankan hook project untuk tiap panggilan
   tool. Terkirim apa adanya; marker `.claude/sdlc-phase` hanya menggerbangi blokir, bukan
   eksekusi. Tidak ditangani di run ini.
5. [kepatuhan minor] AC-3 hanya dipaku untuk `ctrlKey` pada target interaktif (6 dari 9 sel
   kombinasi tanpa pin). Masih terbuka di test HEAD (`test/unit.input.test.mjs:60-63`);
   perilaku sumbernya benar (probe run ini 9/9 -> `null`).
6. [kepatuhan minor] Celah bernama plan: tidak ada gate tingkat browser untuk Ctrl+P/Cmd+P.
   Tetap celah yang dideklarasikan sendiri oleh `plan.md`; tidak ada gate baru di rilis ini.
7. [kepatuhan minor] `.claude/hooks/protect-tests.sh` dan `.claude/settings.json` masuk diff
   `main..HEAD` di luar daftar berkas T9/plan. Terkirim di commit squash; terlihat di
   `git diff --name-only 0fb320f..HEAD`.
8. [kepatuhan nit] `index.html:47` membalik keputusan user sebelumnya ("P" tidak dicantumkan
   di hint) tanpa catatan pembalikan. Terkirim apa adanya; keputusan terbaru menang, catatan
   pembalikan tetap tidak ada di artefak.

Di luar scope / apa adanya: review menyatakan dirinya tidak menjalankan `npm test`, `npm run
smoke`, dan bukti eksekusi lain (dikutip dari DATA pass) - di run rilis ini keduanya
dijalankan dan hijau. Temuan terbantah tidak diulang. Review memeriksa revisi `479908f` yang
bukan ancestor `HEAD`, sehingga status tiga temuan hook (no. 1-3) berubah oleh penulisan
ulang hook di `9987a74` sebelum squash. OQ-2 `spec.md` (sisa worktree) sudah diputuskan lead
di luar rantai ini.
```

## Changelog

Satu entri gaya Keep a Changelog untuk rentang ini (`package.json` tetap `1.0.0`; repo tidak
punya `CHANGELOG.md`):

### [Belum dirilis] - 2026-09-22

#### Added

- `P` sebagai alias tombol jeda, di samping `Esc` - disebut di overlay jeda, hint in-page,
  dan README.

#### Changed

- Teks kontrol jeda diseragamkan menjadi "Esc or P" di ketiga salinannya: README bagian
  Controls, hint `index.html`, dan overlay jeda.

#### Fixed

- Tombol aksi (serve, pause, mute) yang ditekan bersama Ctrl, Meta, atau Alt tidak lagi
  menjalankan aksi game; kombinasi itu diserahkan ke browser (mis. Ctrl+P/Cmd+P membuka
  dialog print, bukan menjeda). Perilaku tombol paddle dan aturan repeat tidak berubah.

## Rollback

Jalur yang benar-benar ada di project ini: rilis masuk `main` sebagai satu commit squash
(`89c3ce5`, PR #3, single-parent), jadi membatalkannya adalah revert commit itu - tidak ada
skrip deploy/rollback, tidak ada tag, dan `scripts/` hanya berisi `scripts/screenshot.mjs`.

    git revert 89c3ce5663d88706e56307faa528945f4b6e0ecd   # tanpa -m: single-parent
    # lalu push/merge ke main lewat gate manusia (otorisasi release manager)

Halaman publik disajikan GitHub Pages dari repo ini (README "Play:
https://fadhlillah2.github.io/breakout-3d-webgl/" dan `homepage` di `package.json`); sumber
Pages (branch/folder) tidak bisa diverifikasi dari repo - belum terverifikasi. Bila Pages
memang menyajikan `main`, revert + push mengembalikan versi sebelumnya tanpa langkah deploy
lain.

Celah bernama: lingkungan staging. Project tidak punya staging atau preview environment
(`git grep -i -E "staging|deploy|gh-pages|github pages"` pada berkas tracked di luar
`docs/`: nol hasil; tidak ada workflow deploy). Usulan minimal untuk menguji rollback:
jalankan di checkout revert sebelum push - `npm test` (108), `npm run smoke` (37, butuh
`google-chrome`), dan `npm start` lalu buka `http://127.0.0.1:8000` untuk memastikan build
pra-rilis kembali utuh; tambahan yang lebih baik: satu environment pratinjau GitHub Pages
dari branch kandidat.

## Checklist deploy per tier

Development (agent boleh deploy):

- [x] `npm test` -> 108 pass / 0 fail, exit 0 (run ini).
- [x] `npm run smoke` -> 37 cek `ok`, "all smoke checks passed", exit 0; `google-chrome` ada
      (run ini).
- [x] `npm start` -> server statis lokal dari `tools/serve.mjs` (`http://127.0.0.1:8000`,
      `PORT` untuk ganti). Tidak ada langkah build: halaman adalah ES module statis.

Staging:

- [ ] Tidak ada lingkungan staging di project (tidak ada workflow/deploy/pratinjau; tidak ada
      berkas tracked di luar `docs/` yang menyebut staging).
- [ ] Tidak ada preview environment (tidak ada konfigurasi Pages preview atau environment
      GitHub di repo).
- Celah bernama: staging. Usulan minimal: jalankan `npm test` + `npm run smoke` +
      `npm run screenshot` di checkout kandidat sebelum merge, atau satu job pratinjau.

Production (rilis disiapkan agent, otorisasi bernama oleh release manager):

- [x] Jalur publik ada: GitHub Pages menyajikan repo ini (README "Play:" dan `homepage` di
      `package.json`); sumber Pages belum terverifikasi dari repo.
- [x] Gate CI: `.github/workflows/ci.yml` berjalan pada push ke `main`, PR, dan
      `workflow_dispatch`; menjalankan `npm test` + `npm run smoke`; `permissions: contents:
      read`.
- [ ] Otorisasi bernama oleh release manager: tidak ada jejaknya di repo (tidak ada
      CODEOWNERS, environment protection, CLAUDE.md, atau REVIEW.md).
- [ ] Hook production-gate: tidak ada. Satu-satunya hook project adalah
      `.claude/hooks/protect-tests.sh` (PreToolUse; memblokir perubahan berkas test saat
      `.claude/sdlc-phase` berisi "fix") - gerbang fase fix, bukan gate produksi.
- [ ] Tag rilis / titik rollback: `git tag -l` kosong.

## Triage CI

tidak ada log yang diberikan.

Workflow yang akan menghasilkan log: `.github/workflows/ci.yml` (`npm test` + `npm run
smoke`, dipicu push ke `main` dan PR). Sebagai gantinya, gate lokal dijalankan di run ini:
`npm test` 108/108/0 exit 0; `npm run smoke` 37/37 exit 0.
