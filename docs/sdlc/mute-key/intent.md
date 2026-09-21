# Intent: pintasan keyboard M untuk mute/unmute

Draf oleh lead (sesi prompts-a4, 2026-09-21) tanpa wawancara, sebagai probe rantai artefak
SDLC; dikoreksi dengan bukti dari kode pada commit `cb4a54b` (branch `sdlc-probe`) dan
diverifikasi satu verifikator konteks-segar. Tiap klaim menunjuk `path:baris`. Artefak ini
menunggu penerimaan user.

## Masalah

Mute hanya bisa lewat tombol HUD: `index.html:30` (`<button id="mute" …>`) dan handler
klik di `src/main.js:64`; `sfx.toggle` hanya dipanggil di situ (grep `sfx.toggle` di
`src/` satu hasil). Routing keyboard `keyAction` (`src/input.js:30-36`) mengenal `serve`,
`pause`, `left`, `right` - plus `'native'` untuk serve saat fokus di elemen interaktif
(`src/input.js:31`) - dan tidak mengenal `KeyM` maupun `mute` (`src/input.js`, grep nol).
Pause sudah punya pintasan `Esc` (`src/input.js:9-11`) dan serve punya
`Space`/`Enter`/`NumpadEnter` (`src/input.js:4-7`; `README.md:15`), jadi pemain
keyboard harus pindah ke mouse hanya untuk mute.

## Hasil yang diinginkan

- Menekan `M` (`event.code === 'KeyM'`, `repeat` diabaikan seperti `Esc` di
  `src/input.js:10`) mengganti mute persis seperti klik tombol Mute: `sfx.toggle()` lalu
  `syncMute()` (`src/main.js:60-64`), sehingga state `sfx.muted`, `aria-pressed`, teks
  tombol, dan persist ke localStorage (`src/sfx.js:62-66`, `writeBest` dengan
  `MUTE_KEY`) ikut berubah.
- Daftar kontrol yang menyebut `Esc` ikut menyebut `M`: `README.md` Controls
  (`README.md:12-17`, di samping `Pause: Esc`), `README.md` Accessibility
  (`README.md:125-126`, "A/D or ← → move, Space/Enter serves, Esc pauses"), dan hint
  in-page `index.html:47` ("… Esc = pause"). Baris Limitations "can be muted from the HUD"
  (`README.md:142`) tetap benar, tidak wajib diubah.
- Test unit `keyAction` (`test/unit.input.test.mjs:18-31`, helper `on()` di baris 19)
  mencakup `on('KeyM') === 'mute'` dan `on('KeyM', { repeat: true }) === null`, mengikuti
  pola `Escape` di baris 24-25.

## User terdampak

Pemain yang bermain dengan keyboard (A/D atau panah, `README.md:14`).

## Batasan

- Tanpa dependency baru: `package.json` tidak punya field `dependencies` maupun
  `devDependencies` sama sekali.
- Ikuti pola `src/input.js`: predikat DOM-free per tombol + routing lewat `keyAction`,
  diuji lewat `keyAction` (test `test/unit.input.test.mjs:18-31`, komentar alasannya di
  14-17). Routing di `src/main.js` ditambah satu cabang di handler `keydown`
  `src/main.js:454-460`; `sfx.unlock()` sudah dipanggil untuk tiap aksi non-null di
  `src/main.js:456` sebelum dispatch 457-459, jadi tidak perlu unlock tambahan.
- Behavior tombol Mute, Pause, serve, dan kontrol sentuh tidak berubah; `keyup`
  (`src/main.js:461-464`) tidak disentuh karena mute bukan tombol yang ditahan. Dua
  literal runtime `src/main.js:380` dan `:384` (dipaku `test/unit.markup.test.mjs:58-64`)
  tidak menyebut daftar kontrol lengkap, jadi tidak berubah.
- Perubahan hanya di `src/input.js`, `src/main.js`, `test/unit.input.test.mjs`,
  `README.md`, dan satu baris hint `index.html:47`. Label aria kanvas (`index.html:35`)
  dan teks overlay (`index.html:38`) tidak menyebut `Esc` sekalipun, jadi tidak
  disentuh. `test/unit.markup.test.mjs:16-27` menghitung hint sebagai satu dari tiga
  salinan teks kontrol dan hanya menuntut drag/tap/A\/D/arrow ada di tiap salinan, jadi
  penambahan `M = mute` lolos test itu.
- Cara membuktikan selesai: `npm test` (`node --test`, `package.json:9`; baseline di
  `cb4a54b` 107 pass, 0 fail, exit 0) hijau dengan dua assertion baru di atas. Dua
  assertion itu memaku routing di `keyAction`; cabang handler di `src/main.js` dan
  perilaku browser tidak diperiksa gate mana pun - tak ada test yang menekan tombol, dan
  `tools/smoke.mjs` hanya Chrome `--dump-dom` atas URL ber-parameter yang membaca atribut
  `data-*` (`tools/smoke.mjs:82-169`, tanpa `dispatchEvent`/`KeyboardEvent` di repo) -
  jadi keduanya diverifikasi review, sama seperti cabang serve/pause yang sudah ada.
  Tidak ada test yang membaca README (grep `readme` di `test/` nol), jadi baris README
  juga diverifikasi review. CI (`.github/workflows/ci.yml:24-27`) menjalankan `npm test`
  lalu `npm run smoke`; smoke tidak terpengaruh.

## Keputusan yang diambil dari pola kode (bukan pertanyaan terbuka)

- `M` saat fokus ada di elemen interaktif tetap mengganti mute: pemeriksaan
  `isInteractiveTarget` (`src/input.js:23-26`) hanya dipakai tombol serve
  (`src/input.js:31`) karena `Space`/`Enter` mengaktifkan tombol secara native; `Esc`
  tidak digerbangi, `M` mengikuti `Esc`.
- Tanpa `preventDefault` dan tanpa perlakuan modifier: `Esc` tidak memanggil
  `preventDefault` (`src/main.js:458`), dan tidak ada tombol di `src/input.js` yang
  memeriksa `ctrlKey`/`metaKey`/`altKey`/`shiftKey` (grep `src/` nol); `M` mengikuti pola
  itu.

## Asumsi yang tersisa

- Pilihan tombol `M` (mnemonic mute) belum dikonfirmasi user; tidak ada tabrakan karena
  `KeyM` tidak muncul di mana pun di repo selain berkas ini (grep se-repo), dan satu-satunya
  listener `keydown`/`keyup` ada di `src/main.js:454` dan `:461`.
