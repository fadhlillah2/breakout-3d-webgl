# Spec: pintasan keyboard `M` untuk mute/unmute

Rujukan intent: `docs/sdlc/mute-key/intent.md` (commit `7064c7e`, branch `sdlc-probe`;
diterima user 2026-09-21). Spec ini menjawab APA yang dibangun; urutan kerja milik
plan.md. Semua rujukan baris menunjuk tree ini.

## Konteks masalah

Mute hanya bisa lewat tombol HUD (`index.html:30`, handler klik `src/main.js:64`;
`sfx.toggle` dipanggil hanya di situ). Routing keyboard `keyAction`
(`src/input.js:30-36`) mengenal `serve`, `pause`, `left`, `right`, plus `'native'`
untuk serve saat fokus di elemen interaktif, dan tidak mengenal `KeyM` maupun `mute`.
Pause sudah punya `Esc` (`src/input.js:9-11`) dan serve punya
`Space`/`Enter`/`NumpadEnter` (`src/input.js:4-7`), jadi pemain keyboard harus
pindah ke mouse hanya untuk mute.

## Persyaratan teknis

- T1. Tanpa dependency baru: `package.json` tetap tanpa field `dependencies` maupun
  `devDependencies` (kini memang tidak punya satu pun).
- T2. Routing mengikuti pola `src/input.js`: predikat DOM-free per tombol plus satu
  cabang di `keyAction`, supaya aturannya bisa dipaku test tanpa DOM (alasan pola:
  komentar `test/unit.input.test.mjs:14-17`). Komentar header `src/input.js:1-2`
  ("serve/pause never auto-repeat, paddle keys are held") ikut menyebut mute di antara
  tombol yang tidak auto-repeat, supaya tetap menyatakan kebijakan lengkap berkas.
- T3. `src/main.js` menambah satu cabang dispatch `'mute'` di handler `keydown`
  (`src/main.js:454-460`). `sfx.unlock()` sudah dipanggil untuk tiap aksi non-null di
  `src/main.js:456` sebelum dispatch `457-459`, jadi cabang ini tidak memanggil unlock
  tambahan.
- T4. `M` tidak digerbangi `isInteractiveTarget` (`src/input.js:23-26`): pengecekan itu
  hanya dipakai tombol serve karena `Space`/`Enter` mengaktifkan tombol secara native;
  `Esc` tidak digerbangi, `M` mengikuti `Esc`.
- T5. Tanpa `preventDefault` dan tanpa pemeriksaan modifier (`ctrlKey`, `metaKey`,
  `altKey`, `shiftKey`): `Esc` tidak memanggil `preventDefault` (`src/main.js:458`) dan
  tak ada tombol di `src/input.js` yang memeriksa modifier (grep `src/` nol).
- T6. Handler `keyup` (`src/main.js:461-464`) tidak disentuh: mute bukan tombol yang
  ditahan.
- T7. Berkas yang boleh berubah hanya: `src/input.js`, `src/main.js`,
  `test/unit.input.test.mjs`, `README.md`, dan satu baris hint `index.html:47`.
  Label aria kanvas (`index.html:35`), teks overlay (`index.html:38`), dan dua literal
  runtime `src/main.js:380` dan `:384` (dipaku `test/unit.markup.test.mjs:58-64`) tidak
  berubah karena tidak menyebut daftar kontrol lengkap.
- T8. Test `keyAction` (`test/unit.input.test.mjs:18-31`, helper `on()` di baris 19)
  mendapat dua assertion baru mengikuti pola `Escape` di baris 24-25: `KeyM` tanpa
  repeat menghasilkan `'mute'`, dan `KeyM` dengan `repeat: true` menghasilkan `null`.

## Behavior yang diharapkan

- B1. Menekan `M` (`event.code === 'KeyM'`) tanpa auto-repeat menghasilkan aksi
  `'mute'`; tombol yang ditahan (`repeat: true`) tidak menghasilkan aksi (seperti
  `Esc`), jadi mute tidak berkedip bolak-balik.
- B2. Aksi `'mute'` mengganti mute persis seperti klik tombol Mute (`src/main.js:64`):
  `sfx.toggle()` lalu `syncMute()`, sehingga `sfx.muted` berbalik, `aria-pressed` tombol
  `#mute` menjadi `String(sfx.muted)`, label tombol berganti `Mute`/`Unmute`, dan nilai
  tersimpan ke localStorage lewat `writeBest` dengan `MUTE_KEY` (definisi
  `'breakout-3d.muted'` di `src/sfx.js:7`, pemakaian di `toggle()` `src/sfx.js:62-66`)
  sebagai 1/0.
- B3. `M` tetap mengganti mute saat fokus ada di elemen interaktif (mengikuti `Esc`,
  bukan `Space`/`Enter`; lihat T4).
- B4. Behavior tombol Mute, Pause, serve, paddle, dan kontrol sentuh tidak berubah.
- B5. Tiap salinan teks kontrol yang menyebut `Esc` ikut menyebut `M`: README Controls
  (`README.md:12-17`, di samping `Pause: Esc`), README Accessibility
  (`README.md:125-126`, kalimat "A/D or ← → move, Space/Enter serves, Esc pauses"), dan
  hint in-page (`index.html:47`, kini "… Esc = pause"). Baris Limitations
  "can be muted from the HUD" (`README.md:142`) tetap benar, tidak wajib diubah.
- B6. Pemain yang bermain penuh dengan keyboard (A/D atau panah) bisa mute/unmute tanpa
  menyentuh mouse.

## Acceptance criteria

Tiap butir satu pemeriksaan; metode ceknya ditulis di butir itu.

- AC-1. `keyAction({ code: 'KeyM', repeat: false, target: null })` mengembalikan
  `'mute'`. Cek: assertion baru di `test/unit.input.test.mjs` (T8). Perilaku pra-perubahan
  sudah diprobe: objek event yang sama kini mengembalikan `null`.
- AC-2. `keyAction({ code: 'KeyM', repeat: true, target: null })` mengembalikan `null`.
  Cek: assertion baru di `test/unit.input.test.mjs` (T8).
- AC-3. Handler `keydown` merutekan `'mute'` ke `sfx.toggle()` + `syncMute()` (tanpa
  unlock tambahan). Cek: review diff `src/main.js` — tak ada gate yang menekan tombol,
  dan `tools/smoke.mjs` hanya membaca atribut `data-*` dari `--dump-dom`
  (`tools/smoke.mjs:82-169`; tak ada `dispatchEvent`/`KeyboardEvent` di repo), sama
  seperti cabang serve/pause yang sudah ada.
- AC-4. Di browser, menekan `M` mengganti mute: label `#mute` Mute↔Unmute,
  `aria-pressed` berbalik, suara mati/hidup, dan state bertahan setelah reload (persist
  localStorage). Cek: review diff `src/main.js` — cabang `'mute'` memanggil
  `sfx.toggle()` + `syncMute()`, jalur yang sama dengan klik tombol Mute
  (`src/main.js:60-64`); tak ada gate yang menekan tombol, jadi perilaku browser
  ini diverifikasi review seperti cabang serve/pause (intent.md:58-64).
- AC-5. README Controls (`README.md:12-17`) menyebut `M` di samping `Pause: Esc`.
  Cek: baca berkas (tak ada test yang membaca README; grep `readme` di `test/` nol).
- AC-6. README Accessibility (`README.md:125-126`) menyebut `M` bersama `Esc`. Cek: baca
  berkas.
- AC-7. Hint `index.html:47` menyebut `M` untuk mute di samping `Esc = pause`. Cek: baca
  berkas.
- AC-8. `npm test` (`node --test`, `package.json:9`) hijau: 0 fail, exit 0, dengan dua
  assertion baru di test `keyAction`. Baseline terverifikasi di `7064c7e` (diff ke
  `cb4a54b` hanya menambah intent.md): 107 pass, 0 fail.
- AC-9. `test/unit.markup.test.mjs` tetap lolos: tiap salinan teks kontrol tetap memuat
  drag/tap/A\/D/arrow (`test/unit.markup.test.mjs:16-27`), jadi penambahan `M = mute`
  tidak melanggarnya. Cek: bagian dari `npm test` (AC-8).
- AC-10. Diff hanya menyentuh berkas di T7; selain itu `keyup`, literal
  `src/main.js:380`/`:384`, aria-label kanvas, teks overlay, dan `package.json` tidak
  berubah. Cek: `git diff --name-only` plus baca diff.
- AC-11. Smoke tidak terpengaruh: `npm run smoke` masih lolos dan tak ada check smoke
  yang membaca teks kontrol. Cek: `npm run smoke` (butuh Chrome); CI menjalankan
  `npm test` lalu `npm run smoke` (`.github/workflows/ci.yml:24-27`).

## Asumsi

- AS-1. Pilihan tombol `M` (mnemonic mute) dikonfirmasi user lewat penerimaan intent.md
  2026-09-21; tidak ada tabrakan karena `KeyM` tidak dipakai di `src/`, `test/`,
  `index.html`, `README.md`, maupun `package.json`, dan satu-satunya listener
  `keydown`/`keyup` ada di `src/main.js:454` dan `:461`.

## Pertanyaan terbuka

- Tidak ada; OQ-1 (pilihan `M`) tertutup oleh penerimaan intent.md.
