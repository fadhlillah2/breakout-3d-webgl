# Intent: tombol P sebagai alias jeda

Penulis: lead Fable 5.1 (sesi prompts-a4), draf tanpa wawancara. Status: diterima user
2026-09-22 - perintah "gas kerjakan yang belum terukur" (probe pengukuran parallel/worktree,
hook project, pemanggilan by-name; branch `sdlc-probe-par`, merge tetap keputusan user).

## Masalah

Jeda hanya lewat Escape: `src/input.js` `isPauseKey` menguji `event.code === 'Escape'`
saja; teks overlay jeda di `src/main.js` berbunyi "Press Esc, or click or tap the button, to
resume."; README bagian Accessibility menyebut "Esc" saja. Pemain yang terbiasa dengan
konvensi `P` untuk jeda tidak punya alias.

## Hasil yang diinginkan

`P` (`KeyP`) berperilaku persis seperti Escape untuk jeda dan lanjut, termasuk aturan tanpa
auto-repeat (tombol yang ditahan tidak mengulang jeda). Teks overlay jeda dan README
menyebut keduanya.

## User dan sistem terdampak

Pemain keyboard; `src/input.js`, `src/main.js` (teks overlay), `README.md`,
`test/unit.input.test.mjs`.

## Batasan

Tidak mengubah tombol lain; tanpa dependency baru; semua test dan smoke yang ada tetap
hijau; teks UI tetap bahasa Inggris.

## Pertanyaan terbuka

- Apakah `P` juga dicantumkan di hint layar selain overlay jeda? - diputuskan: tidak, cukup
  overlay jeda dan README.

## Asumsi

Perubahan kecil ini dipakai sebagai probe pengukuran rantai; nilainya nyata tapi kecil.
