# Review mute-key — diff `f3ea7d5` → HEAD

- Diff yang direview: `f3ea7d5` → HEAD `86949b0`
  (`86949b083f4d1dd6056b32c57ada2d2290796608`, dari `git rev-parse HEAD`).
- Berkas tersentuh (`git diff --stat f3ea7d5..HEAD`): `README.md`, `index.html`,
  `src/input.js`, `src/main.js`, `test/unit.input.test.mjs` — 5 berkas, +22/−4.
- Pass yang tidak pulang hasil: []
- Laporan yang terpotong: []
- Catatan: hash HEAD dan rentang diff diperiksa langsung via git di repo ini;
  klaim, evidence, dan vote temuan di bawah dikutip dari data hasil pass/verifier
  workflow dan tidak diperiksa ulang baris per baris di sesi ini.

## Temuan terkonfirmasi

### 1. [bug · minor] `src/main.js:460` — mute lewat keyboard tidak diumumkan ke live region

**Klaim.** Mute lewat keyboard mengubah state pada tombol `#mute` yang tidak sedang
fokus tanpa memperbarui live region `#announce`, sehingga pengguna screen reader yang
fokus di kanvas tidak mendapat pengumuman mute/unmute (klik tombol umumnya terumumkan
lewat aktivasi tombol).

**Evidence.** `src/main.js:460` `else if (action === 'mute') { sfx.toggle(); syncMute(); }`;
`syncMute` (src/main.js:60-62) hanya menyetel `aria-pressed` dan `textContent`; grep
`announce` di src/main.js hanya menulis pada life lost/level/game over/context lost
(baris 406-409, 525, 539), tidak di jalur mute; `#announce` di index.html:48.

**Alasan pembantah tidak membantah.** Kode membuktikan temuan: satu-satunya live region
adalah #announce (index.html:48, satu-satunya aria-live/role=status di repo) dan
satu-satunya penulisan announce.textContent ada di syncStatus (406/407/409), restart
(420), serta context lost/restored (525/539), sedangkan jalur mute (src/main.js:460)
hanya memanggil sfx.toggle() yang DOM-free dan syncMute() (60-63) yang cuma menyetel
aria-pressed/textContent tombol; tak ada MutationObserver atau dispatchEvent di repo.
Skenario valid: isMuteKey tidak digerbangi isInteractiveTarget (src/input.js:36) dan
kanvas punya tabindex=0 serta difokuskan saat pointerdown (src/main.js:445), jadi M
dengan fokus di kanvas mengganti state tanpa pengumuman; rubrik bawaan (tanpa REVIEW.md)
tidak menolak temuan a11y dan severity minor-nya konsisten.

### 2. [bug · nit] `test/unit.input.test.mjs:47` — pin teks cabang mute tidak berjangkar handler

**Klaim.** Pin teks cabang mute membaca seluruh `src/main.js` sebagai string tanpa
jangkar pada handler `keydown`, jadi ia tetap hijau bila cabang `'mute'` dipindah ke
`keyup`, dikomentari, atau menjadi kode mati — posisi cabang tidak terikat.

**Evidence.** test/unit.input.test.mjs:46-48 `const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8'); assert.match(main, /action === 'mute'\)\s*\{[^}]*sfx\.toggle\(\);\s*syncMute\(\);/...`
— regex tidak mengikat konteks `window.addEventListener('keydown'` (src/main.js:454).

**Alasan pembantah tidak membantah.** Terbukti nyata lewat reproduksi (repo tidak
diubah): di salinan scratchpad, mengomentari baris src/main.js:460
`// else if (action === 'mute') { sfx.toggle(); syncMute(); }` tidak membuat regex di
test/unit.input.test.mjs:47 gagal — `node --test test/unit.input.test.mjs` tetap 4/4
hijau karena regex tak memuat jangkar `keydown`/`keyup` (terverifikasi pula via
/keydown/.test(String(re)) = false), dan relokasi teks yang sama ke listener keyup juga
tetap cocok. Teks `action === 'mute'` hanya muncul sekali di src/main.js, dan grep
`KeyboardEvent|dispatchEvent` di repo nol hasil, jadi tidak ada test lain yang mengikat
posisi cabang. Satu nuansa yang tidak membatalkan inti: skenario "dipindah ke keyup"
hanya tetap hijau bila teks `action === 'mute')` dipertahankan; bentuk tulis-ulang
`isMuteKey(event)` justru membuat test merah, tapi klaim intinya — pin tidak mengikat
konteks handler — benar.

### 3. [keamanan · nit] `src/input.js:14` — M diikat ke posisi fisik KeyM, hint menjanjikan "M = mute" lintas layout

**Klaim.** M diikat lewat `event.code` (kode posisi fisik, berbasis layout US), jadi
pada layout non-QWERTY seperti AZERTY tuts berlabel M memancarkan kode fisik lain
(semicolon) sehingga tidak memicu mute, padahal hint baru menjanjikan 'M = mute' di
index.html:47 dan README.md:16. Ini mengikuti B1 spec dan konvensi KeyA/KeyD yang sudah
ada di berkas yang sama, jadi batasan desain lintas-layout yang diwarisi, bukan regresi
implementasi diff ini; tingkah AZERTY belum diverifikasi di sesi ini.

**Evidence.** `src/input.js:14` `return !event.repeat && event.code === 'KeyM';`;
index.html:47 `... Esc = pause &middot; M = mute`; README.md:16 `- Mute: M`. Pembanding
pre-existing: src/input.js:18 `event.code === 'KeyA'`.

**Alasan pembantah tidak membantah.** Setiap jangkar terverifikasi verbatim:
src/input.js:14 `return !event.repeat && event.code === 'KeyM';`, index.html:47 memuat
`M = mute`, src/input.js:18 `event.code === 'KeyA'` (pre-existing), dan grep
`event.key`/`KeyboardEvent` di src/ nol sehingga satu-satunya jalur mute adalah
`keyAction` → `'mute'` → src/main.js:460 (repro node: `{code:'Semicolon'}` → null,
`{code:'KeyM'}` → 'mute'), jadi tuts berlabel M pada layout yang menaruh M di posisi
fisik lain memang tak memicu mute meski hint baru menjanjikannya. spec.md:52 memang
memaku `event.code === 'KeyM'` seperti diklaim temuan (batasan mengikuti spec, bukan
regresi); satu-satunya ketidaktepatan adalah `- Mute: M` ada di README.md:17 bukan 16
(baris 16 `- Pause: Esc`) — geser sitasi satu baris yang tak mengubah substansi,
sementara pemetaan AZERTY spesifik (M → 'Semicolon') tidak bisa saya reproduksi tanpa
browser/layout OS dan temuan sendiri sudah menandainya belum diverifikasi.
(README.md:17 terkonfirmasi di sesi ini: `- Mute: M` ada di baris 17.)

## Temuan terbantah

### [bug · minor] `src/input.js:14` — kombinasi Ctrl/Cmd/Alt/Shift + M ikut men-toggle mute

**Klaim.** Kombinasi Ctrl/Cmd/Alt/Shift+M juga men-toggle mute karena `isMuteKey` hanya
memeriksa `repeat` dan `code`, dan cabang mute di main.js:460 tidak memanggil
`preventDefault`; spec T5 memang memilih tanpa cek modifier (mengikuti pola Esc), jadi
ini intended kecuali diputuskan lain.

**Evidence.** src/input.js:14 `return !event.repeat && event.code === 'KeyM';` (tak ada
cek ctrlKey/metaKey/altKey/shiftKey); spec.md T5: "Tanpa `preventDefault` dan tanpa
pemeriksaan modifier". Dampak shortcut browser pada Ctrl/Cmd+M belum diverifikasi di sini.

**Alasan terbantah.** Premis faktualnya benar — reproduksi node:
`keyAction({code:'KeyM', ctrlKey:true})`, `shiftKey`, dan `metaKey` semuanya
mengembalikan 'mute', dan grep modifier di src/index.html/test nol hit — tetapi spec.md
T5 (baris 33-35) mewajibkan persis "Tanpa `preventDefault` dan tanpa pemeriksaan
modifier (`ctrlKey`, `metaKey`, `altKey`, `shiftKey`)" dan plan.md:35/:150 mengulangnya
sebagai keputusan sadar, jadi ini behavior yang diminta, bukan cacat: rubrik hanya
menampung bug/pelanggaran spec, dan temuan sendiri mengakui "ini intended" serta dampak
shortcut browser "belum diverifikasi".

## Belum dibantah

Tidak ada — `unvoted` kosong; semua temuan yang dipasangkan pembantah pulang hasil.
