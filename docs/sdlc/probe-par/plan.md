# Plan: tombol P sebagai alias jeda

Dibuat oleh: lead (tulisan tangan untuk probe, bukan run sdlc-plan), 2026-09-22; CLAUDE.md
dan REVIEW.md project: tidak ada.

Rujukan: `docs/sdlc/probe-par/intent.md` ("Status: diterima user 2026-09-22") dan
`docs/sdlc/probe-par/spec.md` ("Status penerimaan: diterima lead 2026-09-22").

## Berkas yang berubah

- `src/input.js` (ada)
- `src/main.js` (ada)
- `test/unit.input.test.mjs` (ada)
- `README.md` (ada)

## Urutan kerja

1. T1 - kind: kode - `KeyP` sebagai alias jeda. Berkas: `src/input.js`, `src/main.js`.
   Prasyarat: tidak ada. Cara membuktikan selesai: tambahkan ke test
   `keyAction routes each key to the action main.js applies` di `test/unit.input.test.mjs`
   dua asersi `assert.equal(on('KeyP'), 'pause')` dan
   `assert.equal(on('KeyP', { repeat: true }), null, 'a held P never re-pauses')`; jalankan
   `node --test test/unit.input.test.mjs` - merah dulu, hijau sesudah `isPauseKey` menerima
   `KeyP`; lalu `grep -n "Press Esc or P, or click or tap the button, to resume." src/main.js`
   menemukan satu baris.
2. T2 - kind: dokumen - README menyebut P. Berkas: `README.md`. Prasyarat: tidak ada. Cara
   membuktikan selesai: `grep -n "Esc or P" README.md` menemukan baris di bagian
   Accessibility (baris yang kini berbunyi "Space/Enter serves, Esc").
3. T3 - kind: verifikasi - bukti keseluruhan pada revisi ter-commit. Berkas: tidak ada.
   Prasyarat: T1, T2. Cara membuktikan selesai: `npm test` dan `npm run smoke` hijau, dan
   `git diff main..HEAD --stat` hanya memuat keempat berkas di atas plus `docs/sdlc/probe-par/`.

## Risiko

- Smoke headless Chrome bisa gagal di lingkungan tanpa browser - mitigasi: bila `npm run
  smoke` tidak bisa jalan di worktree, laporkan di notes, verifikasi T3 menjalankannya di
  checkout utama.
- Worktree bercabang dari `origin/main`, jadi commit branch kerja belum ada di sana - wajar.

## Cara membuktikan selesai keseluruhan

- `npm test`
- `npm run smoke`

Status penerimaan: diterima lead 2026-09-22.
