# Spec: umumkan mute/unmute dari keyboard ke live region

Rujukan intent: `docs/sdlc/announce-mute/intent.md` (commit `13f2f99`, branch
`sdlc-announce`; `main` `080eea2`; sha256 intent `b84ce7ec…`; intent diterima user
2026-09-21). Spec ini menjawab APA yang dibangun; urutan kerja milik plan.md. Semua
rujukan baris menunjuk tree ini.

## Konteks masalah

Mute lewat `M` mengubah state tombol `#mute` yang sedang tidak fokus: cabang keyboard
`src/main.js:460` (`else if (action === 'mute') { sfx.toggle(); syncMute(); }`), dan
`syncMute` (`src/main.js:60-63`) hanya menyetel `aria-pressed` dan `textContent` tombol.
Live region tunggal `#announce` (`index.html:48`, `role="status" aria-live="polite"`) hanya
ditulis pada nyawa hilang, level baru, dan game over (`src/main.js:406-409`), restart
(`:420`), serta konteks WebGL hilang/pulih (`:525`, `:539`) — tidak di jalur mute. Pemain
screen reader yang fokus di kanvas (`tabindex="0"`, `index.html:34`; kanvas difokuskan saat
pointerdown, `src/main.js:445`) menekan `M` tanpa umpan balik. Sumber temuan: review
mute-key, temuan #1 (`docs/sdlc/mute-key/review.md:15-36`).

## Persyaratan teknis

- T1. Tanpa dependency baru: `package.json` tetap tanpa field `dependencies` maupun
  `devDependencies`.
- T2. Perubahan hanya di tiga berkas: `src/main.js` (cabang mute `:460` diperluas di
  tempat; intent memperkirakan satu baris tambahan, bentuk persisnya ada di plan.md),
  `test/unit.input.test.mjs` (test pin `:45-49` diperluas), dan `README.md` (satu kalimat
  Accessibility). `index.html`, `src/input.js`, `src/sfx.js`, dan `package.json`
  tidak berubah; `#announce` (`index.html:48`) dan `announce` (`src/main.js:43`) sudah ada.
- T3. Pengumuman ditulis lewat variabel `announce` yang ada, tetap di region `polite`
  `#announce`; tanpa region `assertive` baru dan tanpa elemen baru.
- T4. Penulisan `announce` hanya ditambahkan di cabang keyboard `:460`, sesudah
  `syncMute()`. `syncMute` (`:60-63`) dan jalur klik (`:64`) tidak menulis `announce`:
  `syncMute` juga dipanggil saat muat halaman (`:65`), jadi pengumuman di sana akan
  bersuara saat halaman dibuka; klik tombol sudah terumumkan lewat `aria-pressed` tombol
  yang fokus (klaim, lihat AS-2).
- T5. Di jalur keyboard, pengumuman dilewati bila fokus di tombol `#mute`
  (`document.activeElement === muteButton`): `M` tidak digerbangi target tombol
  (`src/input.js:37`, dipaku `test/unit.input.test.mjs:29-30`) dan di situ `aria-pressed`
  tombol yang fokus sudah berubah.
- T6. Teks pengumuman: `Sound muted.` saat jadi mute, `Sound on.` saat unmute; bahasa
  Inggris seperti teks region lain (`src/main.js:406-409`). Teks pengumuman lain tidak
  diubah.
- T7. Test pin cabang mute (`test/unit.input.test.mjs:45-49`, regex atas teks
  `src/main.js`) diperluas sehingga cabang wajib memuat penulisan `announce.textContent`
  sesudah `syncMute()`; pin harus merah pada tree pra-perubahan (cabang `:460` di tree ini
  memang belum menulis `announce`; bukti merah dicatat plan.md sebelum cabang diubah).
- T8. `README.md` Accessibility (`:128-129`) ikut menyebut mute dari keyboard pada kalimat
  live region. Dua salinan lain tidak perlu berubah: `README.md:126-127` sudah memuat
  `M mutes` dan `index.html:47` sudah memuat `M = mute`.

## Behavior yang diharapkan

- B1. `M` saat fokus bukan di `#mute` (mis. fokus di kanvas): mute berubah persis seperti
  sekarang (`sfx.toggle()` lalu `syncMute()`), dan sesudahnya `#announce` berisi
  `Sound muted.` (jadi mute) atau `Sound on.` (unmute).
- B2. `M` saat fokus di `#mute`: state tetap berubah seperti B1, tetapi `#announce` tidak
  berubah.
- B3. Klik tombol `#mute`: state berubah, `#announce` tidak berubah (tidak ada pengumuman
  ganda).
- B4. Pengumuman lain tidak berubah: nyawa hilang/level baru/game over (`:406-409`),
  restart mengosongkan (`:420`), konteks WebGL hilang/pulih (`:525`, `:539`).
- B5. Perilaku mute sendiri tidak berubah: `sfx.muted`, `aria-pressed`, label
  `Mute`/`Unmute`, dan persist localStorage `breakout-3d.muted` (`src/sfx.js:7,62-66`).
- B6. `README.md:128-129` menyatakan mute dari keyboard ikut diumumkan.

## Acceptance criteria

Tiap butir satu pemeriksaan; metode ceknya ditulis di butir itu.

- AC-1. Test pin `test/unit.input.test.mjs:45-49` (diperluas) menuntut cabang `:460`
  memuat penulisan `announce.textContent` sesudah `syncMute()`, dan pin itu merah pada tree
  pra-perubahan. Cek: jalankan `npm test` sebelum menyunting `src/main.js` (merah), lalu
  sesudahnya (hijau); regex pra-perubahan tidak memuat `announce`, jadi ekspansinya wajib
  gagal dulu di tree ini.
- AC-2. `npm test` hijau: 108 pass, 0 fail, exit 0, dengan jumlah test tetap 108 (pin
  diperluas, bukan test baru). Cek: output `npm test`; baseline terukur di tree ini
  108/0/exit 0.
- AC-3. Cabang `:460` menulis `announce.textContent` dengan `Sound muted.`/`Sound on.`
  hanya bila `document.activeElement !== muteButton`, sesudah `syncMute()`. Cek: review
  diff `src/main.js` — tak ada gate yang menekan tombol (grep
  `dispatchEvent|KeyboardEvent` di `src/`+`test/`+`tools/` nol hasil; tak ada test DOM),
  jadi teks dan syarat fokus terverifikasi review seperti cabang serve/pause; checklist
  diff: (1) dua literal Inggris ada, (2) kondisi `document.activeElement` ada, (3) urutan
  `sfx.toggle()` → `syncMute()` → penulisan `announce`.
- AC-4. `syncMute` (`:60-63`) dan listener klik (`:64`) tidak menulis `announce`; tidak
  ada kemunculan `announce` baru selain di `:460`. Cek: `grep -n announce src/main.js`
  sesudah perubahan.
- AC-5. Diff `src/main.js` hanya menyentuh cabang `:460`; `keyup` (`:462-465`) dan jalur
  lain tidak berubah. Cek: `git diff src/main.js`.
- AC-6. Berkas yang berubah hanya `src/main.js`, `test/unit.input.test.mjs`, dan
  `README.md`. Cek: `git diff --name-only`.
- AC-7. `README.md:128-129` menyebut mute dari keyboard. Cek: baca berkas — tak ada test
  yang membaca README (grep `readme` di `test/` nol hasil).
- AC-8. `npm run smoke` tetap lolos: 37 check, exit 0 (terukur di tree ini lolos; smoke
  hanya membaca `#announce` di skenario game over, `tools/smoke.mjs:106`, tidak di jalur
  mute). Cek: `npm run smoke` (butuh Chrome); CI menjalankan `npm test` lalu
  `npm run smoke` (`.github/workflows/ci.yml:24-27`).

## Asumsi

- AS-1. Region `#announce` (`index.html:48`) yang ada cukup: `role="status"` +
  `aria-live="polite"`; tidak perlu region assertive baru (keputusan intent dari pola
  kode).
- AS-2. Klaim bahwa screen reader mengumumkan sendiri perubahan `aria-pressed` tombol
  `#mute` yang fokus belum diverifikasi dengan screen reader; ia dasar B2/B3. Bila keliru,
  jalur klik dan `M` saat fokus di tombol ikut butuh pengumuman (lihat OQ-2).
- AS-3. Tak ada gate yang menekan tombol: `tools/smoke.mjs` tanpa `dispatchEvent`/
  `KeyboardEvent` (grep `src/`+`test/`+`tools/` nol hasil) dan tak ada test DOM; teks
  pengumuman dan syarat fokus diverifikasi review diff.
- AS-4. Kata `Sound muted.`/`Sound on.` belum dikonfirmasi user (asumsi intent yang
  tersisa); tidak bentrok dengan teks region lain yang ada.

## Pertanyaan terbuka

- OQ-1. Kata-kata `Sound muted.` / `Sound on.` menunggu keputusan user saat penerimaan
  spec; bila diganti, T6 dan pin AC-1 ikut berubah.
- OQ-2. Verifikasi screen reader atas AS-2: bila `aria-pressed` tombol yang fokus tidak
  diumumkan sendiri, jalur klik (B3) dan `M` saat fokus di tombol (B2) juga perlu
  pengumuman — perluasan scope di luar spec ini.
- OQ-3. Temuan nit #2 review mute-key (`docs/sdlc/mute-key/review.md:38-58`, pin teks
  cabang tak berjangkar ke handler `keydown`) tetap terbuka dan tidak diminta intent ini;
  pin yang diperluas di sini tetap tanpa jangkar handler.
