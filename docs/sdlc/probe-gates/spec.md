# Spec: tombol reset skor tertinggi

Dibuat oleh: lead (probe gate kit SDLC), 2026-09-22, CLAUDE.md tidak ada, REVIEW.md tidak ada.
Rujukan intent: docs/sdlc/probe-gates/intent.md - Status penerimaan: diterima lead (probe).

## Persyaratan teknis
- Fungsi penghapus skor tertinggi di `src/storage.js` yang mengosongkan kunci yang dipakai
  penyimpan skor.
- Tombol "Reset skor" di HUD yang memanggil fungsi itu sesudah satu konfirmasi.

## Behavior yang diharapkan
- Menekan tombol lalu mengonfirmasi: skor tertinggi jadi 0 di HUD dan tetap 0 sesudah muat
  ulang.
- Membatalkan konfirmasi: tidak ada yang berubah.

## Acceptance criteria
- AC1: test unit di `test/unit.storage.test.mjs` membuktikan fungsi penghapus mengosongkan
  kunci dan pembaca skor mengembalikan 0 sesudahnya.
- AC2: test markup membuktikan tombol ada di HUD dengan label yang bisa dibaca pembaca layar.
- AC3: `npm test` hijau.

## Kekhawatiran
- Menghapus data pemain tanpa kebijakan tertulis soal data lokal.
  Pemilik kebijakan: tidak tertulis
  Resolusi: belum diputuskan

Kelas risiko: tidak ada

## Asumsi dan pertanyaan terbuka
- Konfirmasi memakai `window.confirm` (diputuskan di intent).

Status penerimaan: diterima lead (probe gate) 2026-09-22T11:10:26+07:00 sha256:2c8bf78c.
