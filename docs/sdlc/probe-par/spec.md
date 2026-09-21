# Spec: tombol P sebagai alias jeda

Dibuat oleh: lead (tulisan tangan untuk probe, bukan run sdlc-spec), 2026-09-22; CLAUDE.md
dan REVIEW.md project: tidak ada.

Rujukan intent: `docs/sdlc/probe-par/intent.md` - "Status: diterima user 2026-09-22".

## Persyaratan teknis

- `isPauseKey` di `src/input.js` menerima `Escape` dan `KeyP`, tetap menolak `repeat`.
- Teks overlay jeda di `src/main.js` menyebut kedua tombol: "Press Esc or P, or click or tap
  the button, to resume."
- README: baris Accessibility yang menyebut "Esc" menyebut "Esc or P".

## Behavior yang diharapkan

`keyAction({code:'KeyP', repeat:false})` → `'pause'`; `keyAction({code:'KeyP', repeat:true})`
→ `null`; Escape tidak berubah; tombol lain tidak berubah.

## Acceptance criteria

- AC-1 (perilaku): test di `test/unit.input.test.mjs` menguji `on('KeyP') === 'pause'` dan
  `on('KeyP', {repeat:true}) === null`, dan lulus.
- AC-2 (perilaku): semua test unit yang ada tetap lulus (`npm test`) dan smoke tetap lulus
  (`npm run smoke`).
- AC-3 (teks): `src/main.js` memuat "Press Esc or P, or click or tap the button, to resume."
- AC-4 (dokumen): README memuat "Esc or P" di bagian Accessibility.

## Kekhawatiran

Tidak ada kebijakan project yang bertabrakan (tanpa CLAUDE.md/REVIEW.md).

Kelas risiko: tidak ada.

Status penerimaan: diterima lead 2026-09-22.
