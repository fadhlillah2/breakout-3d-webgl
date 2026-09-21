# Intent: tindak lanjut review alias jeda P - modifier dan teks kontrol

Penulis: lead Fable 5.1 (sesi prompts-a4), draf tanpa wawancara dari
`docs/sdlc/probe-par/review.md`. Status: diterima user 2026-09-22 - keputusan grilling Q3
("gas semua sesuai rekomendasi": tambal dua temuan review lewat rantai, lalu PR squash).

## Masalah

1. `src/input.js`: predikat tombol aksi (`isServeKey`, `isPauseKey`, `isMuteKey`) tidak
   memeriksa modifier, jadi Ctrl+P / Cmd+P (print browser), Ctrl+M, dan kombinasi modifier
   lain ikut dirutekan ke aksi game; `keyAction` mengembalikan aksi padahal browser
   punya arti sendiri untuk kombinasi itu (temuan review probe-par, bug + keamanan, minor).
2. Teks kontrol tidak konsisten sesudah `P` jadi alias jeda: README bagian Controls masih
   "Pause: Esc" dan hint di `index.html` masih "Esc = pause", sementara overlay jeda dan
   README bagian Accessibility sudah menyebut "Esc or P" (temuan review, minor + nit).

## Hasil yang diinginkan

- Tombol aksi (serve, pause, mute) yang ditekan bersama Ctrl, Meta, atau Alt tidak menjadi
  aksi game: `keyAction` mengembalikan `null` (biarkan browser), tanpa mengubah perilaku
  tombol paddle (kiri/kanan) dan tanpa mengubah aturan repeat yang ada.
- Ketiga salinan teks kontrol (README Controls, hint `index.html`, overlay jeda) menyebut
  "Esc or P" untuk jeda.

## User dan sistem terdampak

Pemain keyboard; `src/input.js`, `test/unit.input.test.mjs`, `index.html`,
`test/unit.markup.test.mjs` bila ia memaku teks hint, `README.md`.

## Batasan

Tidak mengubah tombol atau teks lain; tanpa dependency baru; semua test dan smoke tetap
hijau; teks UI bahasa Inggris; Shift tidak dihitung modifier (Shift+Space tetap serve).

## Pertanyaan terbuka

- Apakah Alt ikut dihitung modifier? - diputuskan: ya (Alt+tombol punya arti menu/aksesibilitas
  di beberapa platform).

## Asumsi

Perubahan ini rantai ketiga di branch `sdlc-probe-par`; merge ke `main` lewat PR squash
sesuai keputusan Q3.
