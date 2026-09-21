# Intent: umumkan mute/unmute dari keyboard ke live region

Draf oleh lead (sesi prompts-a4, 2026-09-21 malam) tanpa wawancara, lahir dari temuan
review `docs/sdlc/mute-key/review.md` (umpan balik lintas-play); bukti dari kode pada
`main` `080eea2` (branch `sdlc-announce`). Tiap klaim menunjuk `path:baris`. Artefak ini
menunggu penerimaan user.

## Masalah

Mute lewat `M` (`src/main.js:460`, cabang `else if (action === 'mute') { sfx.toggle();
syncMute(); }`) mengubah state tombol `#mute` yang sedang tidak fokus: `syncMute`
(`src/main.js:60-63`) hanya menyetel `aria-pressed` dan `textContent` tombol. Satu-satunya
live region halaman, `#announce` (`index.html:48`, `role="status" aria-live="polite"`),
hanya ditulis pada nyawa hilang, level baru, dan game over (`src/main.js:406-409`),
restart (`:420`), serta context WebGL hilang/pulih (`:525`, `:539`) - tidak di jalur mute.
Pengguna screen reader yang fokus di kanvas (`tabindex="0"`, `index.html:34`; kanvas
difokuskan saat pointerdown `src/main.js:445`) menekan `M` tanpa mendapat umpan balik.
Klik tombol Mute berbeda: perubahan `aria-pressed` pada tombol yang fokus diumumkan screen
reader sendiri (klaim umum, belum diverifikasi dengan screen reader di sesi ini).

## Hasil yang diinginkan

- Saat mute berubah lewat keyboard, `#announce` menerima teks status: `Sound muted.` saat
  jadi mute, `Sound on.` saat unmute - bahasa Inggris seperti teks region lain
  (`src/main.js:406-409`), lewat variabel `announce` yang sudah ada (`src/main.js:43`).
- Jalur klik tombol (`src/main.js:64`) tidak ikut mengumumkan, supaya tidak ganda dengan
  pengumuman `aria-pressed` tombol yang fokus. Jalur keyboard pun melewatkan pengumuman
  region bila fokus sedang di tombol `#mute` (`document.activeElement === muteButton`),
  karena `M` tidak digerbangi target tombol (`test/unit.input.test.mjs:29-30`) dan di
  situ `aria-pressed` tombol yang fokus sudah berubah.
- Test pin cabang mute (`test/unit.input.test.mjs:45-49`, regex atas teks `src/main.js`)
  diperluas sehingga cabang wajib memuat penulisan `announce.textContent` sesudah
  `syncMute()`; test itu merah dulu sebelum cabang diubah.
- `README.md` Accessibility (`README.md:128-129`, "a polite live region that announces a
  lost life, a new level and the final score") ikut menyebut mute dari keyboard.

## User terdampak

Pemain screen reader yang bermain dengan keyboard.

## Batasan

- Perubahan hanya di `src/main.js` (cabang `:460`, satu baris tambahan),
  `test/unit.input.test.mjs` (regex pin), dan `README.md` (satu kalimat). `index.html`
  dan `src/sfx.js` tidak berubah; `#announce` dan `announce` sudah ada.
- Tanpa dependency baru; tanpa mengubah teks pengumuman lain; jalur `syncMute` tetap
  DOM-only seperti sekarang.
- Cara membuktikan selesai: `npm test` (baseline di `080eea2`: 108 pass) hijau dengan pin
  yang diperluas, `npm run smoke` (37 check) tetap lolos. Tak ada gate yang menekan tombol
  atau membaca `#announce` saat mute (`tools/smoke.mjs` tanpa `dispatchEvent`/
  `KeyboardEvent`), jadi isi teks pengumuman dan syarat fokus hanya diverifikasi review
  diff. Tidak ada test yang membaca README.

## Keputusan yang diambil dari pola kode

- Pengumuman ditaruh di cabang keyboard `src/main.js:460`, bukan di `syncMute`, karena
  `syncMute` juga dipanggil saat muat halaman (`src/main.js:65`) dan dari klik tombol;
  mengumumkan di sana akan bersuara saat halaman dibuka.
- Teks tetap di region `polite` yang ada; tidak membuat region `assertive` baru.

## Asumsi yang tersisa

- Kata-kata `Sound muted.` / `Sound on.` belum dikonfirmasi user.
- Klaim bahwa screen reader mengumumkan perubahan `aria-pressed` tombol yang fokus belum
  diverifikasi dengan screen reader; bila keliru, jalur klik pun perlu pengumuman.
