# Review: probe-par-fix — penjagaan modifier tombol aksi dan penyeragaman teks kontrol jeda

Dibuat oleh: sdlc-review; args root=. change=probe-par-fix base=main; model pelaksana: deepseek-flash[1m]; 2026-09-22; sha256 pendek: CLAUDE.md=tidak ada, REVIEW.md=tidak ada.

Diff yang direview: `main` → HEAD `479908fe7ba405e86d38bd860751d44de5ad742a` (`git rev-parse HEAD`; branch `sdlc-probe-par`); 14 berkas, +760/−8: `.claude/hooks/protect-tests.sh`, `.claude/settings.json`, `README.md`, `docs/sdlc/probe-par-fix/{intent,plan,spec}.md`, `docs/sdlc/probe-par/{intent,plan,review,spec}.md`, `index.html`, `src/input.js`, `src/main.js`, `test/unit.input.test.mjs`. Rantai fix yang diperiksa: `afdf733..HEAD` (berkas `.claude/*` dan `docs/sdlc/probe-par/*` masuk diff lewat commit setup sebelum basis itu).

- Pass yang tidak pulang hasil: []
- Laporan yang terpotong: []

Rubrik: `REVIEW.md` dan `CLAUDE.md` tidak ada (dicek di sesi ini; `docs/sdlc/probe-par-fix/spec.md:125-127` dan `plan.md:3-5` mencatat hal yang sama) → rubrik bawaan: maksimum lima nit terkonfirmasi plus satu baris hitungan. Nit terkonfirmasi: 1 (tidak ada sisa). Jumlah temuan: 8 terkonfirmasi (7 minor, 1 nit), 7 terbantah (3 minor, 4 nit), 0 belum dibantah.

Verifikasi sesi ini (dibuka sendiri): hash HEAD, `git diff main..HEAD --stat`/`--name-status`, `git log main..HEAD`, `git branch --show-current`; `.claude/hooks/protect-tests.sh` (utuh), `.claude/settings.json`, `src/input.js` (utuh), `src/main.js:440-469`, `test/unit.input.test.mjs` (utuh), `index.html:47`, `README.md:16` dan `:127`, `tools/smoke.mjs` (utuh, tidak mengirim event keyboard), `.github/workflows/ci.yml`, `package.json`, `docs/sdlc/probe-par-fix/{intent,spec,plan}.md` (utuh), `docs/sdlc/probe-par/intent.md:32-33`, `docs/sdlc/probe-par/review.md:22`; grep `protect-tests|jq` di luar `docs/` hanya mengenai hook + `.claude/settings.json`; `git status --porcelain` bersih; `.claude/sdlc-phase` dan `.playwright-mcp/` tidak ada di tree saat review ditulis. Belum dijalankan ulang / belum diperiksa di sesi ini: `npm test`, `npm run smoke`, dan seluruh bukti eksekusi (probe hook, PATH tanpa `jq`, repro headless Chromium, grep `dispatchKeyEvent`) — semuanya dikutip apa adanya dari DATA pass dan pembantah.

## Temuan terkonfirmasi

### [bug · minor] `.claude/hooks/protect-tests.sh:11` — pendeteksi `>>?` juga cocok dengan redirect fd (`2>&1`, `>&2`)

**Klaim.** Token `>>?` di daftar alternasi grep baris 11 juga cocok dengan redirect fd, sehingga perintah baca-saja yang menjalankan test lalu menggabungkan stderr (mis. `node --test test/unit.input.test.mjs 2>&1 | tail -5`) diblokir exit 2 dengan pesan yang menyatakan ia menulis ke berkas test.

**Evidence.** Baris 11 memuat `sed -i|>>?|\btee\b|\bmv\b|\bcp\b|\brm\b|\bpatch\b|git (checkout|restore)|truncate`, dan komentar cakupan baris 3 menyebut "redirect" (dibaca di sesi ini). Probe pass: `CLAUDE_PROJECT_DIR` diarahkan ke direktori sementara di luar repo ber-marker `fix`, payload `{"tool_name":"Bash","tool_input":{"command":"node --test test/unit.input.test.mjs 2>&1 | tail -5"}}` → exit 2, stderr "protect-tests: fase fix - perintah shell ini menulis ke berkas test. ..."; perintah sama tanpa `2>&1` → exit 0; varian `>&2` juga exit 2; `printf '%s' '2>&1 | tail -5' | grep -Eq '>>?'` → exit 0. Pass: bug; juga dilaporkan pass keamanan.

**Alasan pembantah tidak membantah.** Confidence high, tidak terbantah: baris 11 memang memuat token `>>?` di dalam daftar alternasi `grep -E`, dan `>>?` cocok dengan `2>&1`/`>&2`; reproduksi diulang persis dan varian `>&2` memberi hasil sama (exit 2), sementara tanpa `2>&1` exit 0. Hook terdaftar di `.claude/settings.json` (matcher `Edit|Write|MultiEdit|NotebookEdit|Bash`), bukan berkas generate/vendor/lockfile, dan tidak ditegakkan CI (`.github/workflows/ci.yml` hanya menjalankan `npm test` + `npm run smoke`) sehingga rubrik bawaan tidak menolaknya; keluarga minor karena hanya memblokir perintah baca-saja, bukan mengubah behavior aplikasi yang diminta. Catatan: `.claude/sdlc-phase` tidak ada di repo saat ini (hook inert sampai fase fix diaktifkan), jadi probe menyalakan marker itu untuk mereproduksi mode aktifnya; repo tidak berubah (status bersih) dan direktori probe sementara dihapus.

### [bug · minor] `.claude/hooks/protect-tests.sh:11` — penulisan test lewat `git apply`/interpreter lolos

**Klaim.** Hook hanya menilai teks perintah, jadi penulisan berkas test yang tidak menyebut token tulis apa pun lolos: patch dan penulisan via interpreter sama-sama exit 0, padahal komentar cakupan di baris 3 mengklaim 'patch' termasuk.

**Evidence.** Probe (marker `fix`): `git apply` sebuah berkas diff di luar repo → exit 0; `node -e "require('fs').writeFileSync('test/unit.input.test.mjs','')"` → exit 0; varian lebih tajam `python3 -c "open('test/unit.input.test.mjs','w').write('x')"` → exit 0; `git apply --include=test/unit.input.test.mjs` (path test eksplisit di teks perintah) → exit 0. Kontrol semuanya exit 2: `printf x > test/unit.input.test.mjs`, heredoc `cat > test/...`, `patch -p1 test/... < <berkas diff>`, dan Write tool dengan `file_path` test. Baris 3: "Cakupan: ... (sed -i, redirect, tee, mv, cp, rm, patch, git checkout/restore); lapis kedua tetap verifikator play test."

**Alasan pembantah tidak membantah.** Tidak terbantah: input sah (fase fix memang mengaktifkan hook; playbook SDLC menulis marker `.claude/sdlc-phase` build/fix), dan setiap kontrol exit 2 sementara varian di atas exit 0, jadi lolosnya bukan artefak probe. Dua koreksi kecil pada bukti yang tidak mengubah kesimpulan: (1) `git apply` ke diff umum lolos karena gate POLA (path test) juga gagal, bukan semata karena tak ada token tulis; (2) `patch` literal di baris 11 memang diblokir, sehingga frasa "komentar baris 3 mengklaim patch" tepat bila `patch` dibaca sebagai "penerapan patch" (`git apply`), bukan biner `patch(1)`.

### [bug · minor] `.claude/hooks/protect-tests.sh:7` — tanpa `jq` hook gagal-terbuka (exit 0)

**Klaim.** Tanpa `jq` di PATH hook gagal-terbuka: `TOOL` dan `FILE` menjadi string kosong sehingga Edit/Write ke berkas test lolos exit 0 (tidak ada `command -v jq` maupun `set -e`), sehingga guard ini inert diam-diam di mesin tanpa jq.

**Evidence.** Probe dengan PATH hanya berisi symlink `cat/grep/sed/head/sh`, marker fix, payload `{"tool_name":"Edit","tool_input":{"file_path":".../test/unit.input.test.mjs"}}` → stderr "jq: command not found" di baris 7 dan 17, exit 0; dengan PATH normal payload yang sama → exit 2 "berkas test tidak boleh diubah". Jalur Bash juga lolos tanpa jq (`printf x >> test/unit.input.test.mjs` exit 0) dan exit 2 dengan jq. Sesi ini: baris 7/10/17 memakai `jq`, tanpa `command -v jq`/`set -e`; jq tidak dideklarasikan di `package.json`, README, maupun CI. Pass: bug; juga dilaporkan pass keamanan.

**Alasan pembantah tidak membantah.** Tidak terbantah: kegagalan-terbuka disebabkan ketiadaan jq, bukan PATH yang dipangkas (PATH terbatas yang sama + symlink jq → exit 2 "berkas test tidak boleh diubah"); minor tetap wajar karena pada mesin ini jq ada di `/usr/bin/jq` sehingga cacatnya laten, bukan pada input valid yang diuji; repo tetap bersih dan artefak probe dihapus.

### [keamanan · minor] `.claude/settings.json:1` — hook project dieksekusi harness untuk tiap panggilan tool

**Klaim.** Diff meng-commit hook project yang dijalankan harness untuk setiap panggilan Edit/Write/MultiEdit/NotebookEdit/Bash; badan skrip selalu dieksekusi dan marker `.claude/sdlc-phase` hanya menggerbangi pemblokiran, bukan eksekusi, sehingga berkas di repo ini menjadi jalur eksekusi kode di mesin pengembang.

**Evidence.** `{"hooks":{"PreToolUse":[{"matcher":"Edit|Write|MultiEdit|NotebookEdit|Bash","hooks":[{"type":"command","command":"\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/protect-tests.sh"}]}]}}` (dicek di sesi ini); tanpa `.claude/sdlc-phase` (dicek: tidak ada) hook tetap dijalankan dan keluar 0; transkrip sesi repo ini merekam `PreToolUse:Edit hook error: ["$CLAUDE_PROJECT_DIR"/.claude/hooks/protect-tests.sh]: protect-tests: fase fix - berkas test tidak boleh diubah`, jadi harness benar-benar menjalankannya.

**Alasan pembantah tidak membantah.** Tidak terbantah: `git diff main -- .claude/` menampilkan `.claude/settings.json` dan hook sebagai berkas tracked baru; reproduksi `printf ... | bash -x .claude/hooks/protect-tests.sh` tanpa marker menunjukkan badan skrip dieksekusi lalu `exit 0` — marker hanya menggerbangi `exit 2`; catatan playbook user merekam hook menyala di worktree worker dan checkout utama, termasuk cakupan Bash. Dua pelemah yang tidak membatalkan: visibilitas repo publik belum diverifikasi (remote GitHub ada, visibilitas tidak dicek) dan Claude Code menuntut trust/approval settings project sebagai mitigasi. Tidak ada berkas yang diubah.

### [kepatuhan · minor] `test/unit.input.test.mjs:60` — AC-3 hanya dipaku untuk `ctrlKey` pada target interaktif

**Klaim.** AC-3 hanya dipaku untuk `ctrlKey` pada target interaktif; varian `altKey`/`metaKey` yang disebut AC-3 tidak pernah diuji.

**Evidence.** Diff menambah loop `Space`/`Enter`/`NumpadEnter` di target interaktif hanya dengan `ctrlKey: true` (`test/unit.input.test.mjs:60-63`, dibaca di sesi ini); loop semua modifier di `:40-44` memakai helper `on()` (`:20`) dengan default `target: null` sehingga tak pernah menyentuh `isInteractiveTarget`; satu-satunya kemunculan metaKey/altKey lain adalah `:40` (target null) dan `:52` (paddle). `spec.md:96-98` (AC-3) menuntut persis varian `altKey`/`metaKey` pada target interaktif → 6 dari 9 sel kombinasi tidak dipin di berkas mana pun (grep `native|keyAction|closest` di `test/` hanya mengenai `unit.input.test.mjs`). Perilaku sumbernya sendiri benar (`src/input.js:8`; 9 kombinasi → `null`) dan `node --test test/unit.input.test.mjs` hijau 4/4.

**Alasan pembantah tidak membantah.** Tidak terbantah: `plan.md:88-92` memang menyalin assertion ctrlKey-only itu, tapi plan tidak membatalkan tuntutan varian di AC-3; ini celah pin/coverage yang tidak mengubah behavior, sesuai severity minor.

### [kepatuhan · minor] `docs/sdlc/probe-par-fix/plan.md:215` — celah bernama 'dialog print Ctrl+P/Cmd+P di browser' tanpa gate otomatis

**Klaim.** B1/AC-1..AC-3 tidak punya gate tingkat browser, jadi 'Ctrl+P tidak menjeda' hanya terbukti lewat unit test `keyAction`.

**Evidence.** `plan.md:215-218` verbatim: "Celah bernama: dialog print Ctrl+P/Cmd+P di browser - B1/AC-1 sampai AC-3 tidak punya gate tingkat browser: tak ada `dispatchEvent`/`KeyboardEvent` di repo dan `tools/smoke.mjs` tidak mengirim event keyboard" (dicek di sesi ini; `tools/smoke.mjs` dibaca utuh hanya memakai `chrome --dump-dom`, tanpa satu pun event keyboard). `npm run smoke` hijau tanpa menekan tombol; satu-satunya bukti perilaku browser yang pernah ada (`docs/sdlc/probe-par/review.md:36`) dibuat lewat sesi Playwright di luar repo, bukan gate.

**Alasan pembantah tidak membantah.** Confidence medium, tidak terbantah: kutipan plan akurat dan verifikasi ulang sepakat — grep `dispatchEvent|KeyboardEvent` se-repo hanya mengenai `docs/sdlc/*.md`, `npm test` 108 pass/0 fail, `npm run smoke` "all smoke checks passed" tanpa satu pun event keyboard; rubrik bawaan tidak punya klausa yang menolak temuan minor atas celah yang sudah dideklarasikan. Pelemah kecil yang tidak cukup membantah: kata "tidak punya gate otomatis" menjatuhkan kualifikasi "tingkat browser" (unit test itu sendiri gate otomatis, dan justru metode cek AC-1..AC-3 di `spec.md:92-98`), dan `spec.md:133-136` sudah mendeklarasikan batas verifikasi yang sama.

### [kepatuhan · minor] `.claude/hooks/protect-tests.sh:1` — dua berkas harness masuk diff `main..HEAD` di luar daftar T9/plan

**Klaim.** Dua berkas harness SDLC ikut menjadi berkas baru di diff `main..HEAD` di luar daftar berkas yang diizinkan spec T9/plan (dari commit setup sebelum basis rantai fix, bukan dari fase build).

**Evidence.** `git diff main --name-status` (dicek di sesi ini) memuat `A .claude/hooks/protect-tests.sh` dan `A .claude/settings.json`; `plan.md:24-31` hanya mendaftar `src/input.js`, `test/unit.input.test.mjs`, `README.md`, `index.html` plus "Tidak ada berkas baru"; `spec.md:66-69` (T9) hanya mengizinkan empat berkas itu plus `test/unit.markup.test.mjs`; AC-12 diukur pada rentang `afdf733..HEAD` yang tidak memuat kedua berkas itu; `git log main..HEAD` menempatkan keduanya di `4b24dcc`/`e74fa48`/`afdf733` (semuanya ≤ basis rantai fix).

**Alasan pembantah tidak membantah.** Tidak terbantah: `git diff main --diff-filter=A --name-status` menampilkan keduanya sebagai `A`, `git show main:.claude/settings.json` mengonfirmasi keduanya belum ada di `main`, `git log main..HEAD -- .claude/` memperlihatkan asalnya dari commit setup sehingga klausa "dari commit setup sebelum basis rantai fix" akurat, dan hook memang inert karena `.claude/sdlc-phase` tidak ada (`protect-tests.sh:6` `[ -f ... ] || exit 0`). Tidak ada dasar rubrik untuk menolaknya (bukan berkas generate/vendor/lockfile, bukan aturan CI); nuansa bahwa AC-12 diukur pada `afdf733..HEAD` (yang lulus tanpa kedua berkas itu) sudah disebut temuan sendiri, sehingga label minor/kepatuhan tetap tepat.

### [kepatuhan · nit] `index.html:47` — hint membalik keputusan user sebelumnya tanpa catatan pembalikan

**Klaim.** Perubahan hint in-page membalik keputusan user sebelumnya (P tidak dicantumkan di hint) tanpa catatan pembalikan di intent/spec rantai ini.

**Evidence.** `docs/sdlc/probe-par/intent.md:32-33` (status 'diterima user 2026-09-22'): "Apakah `P` juga dicantumkan di hint layar selain overlay jeda? - diputuskan: tidak, cukup overlay jeda dan README." vs `docs/sdlc/probe-par-fix/intent.md:22-23` ("Ketiga salinan teks kontrol (README Controls, hint `index.html`, overlay jeda) menyebut \"Esc or P\"") dan `index.html:47` "... &middot; Esc or P = pause &middot; M = mute" (dicek di sesi ini). Rantai probe-par tidak menyentuh `index.html`; tak ada kalimat penyupersesi (grep "menggantikan|membalik|pembalikan|supersede|keputusan lama|dicabut" di `docs/sdlc/probe-par-fix` nol hasil). Keputusan terbaru menang.

**Alasan pembantah tidak membantah.** Tidak terbantah: semua jangkar bukti cocok verbatim (`index.html:47` kini "Esc or P = pause", diff satu baris vs `main`), rantai probe-par terbukti tidak menyentuh `index.html`, dan pembacaan penuh intent/plan/spec fix tidak menemukan kalimat penyupersesi; tak ada klausa rubrik (generate/vendor/lockfile/CI) yang menolaknya. Catatan DATA yang tidak saya turuti: `docs/sdlc/probe-par/review.md:22` menyuruh "jangan dijadikan temuan susulan" — hanya disebut, tidak dijalankan (lihat bagian Catatan instruksi dalam DATA).

## Temuan terbantah

### [keamanan · minor] `test/unit.input.test.mjs:61` — Ctrl+Space pada tombol game yang fokus

**Klaim.** Penjagaan modifier tidak menutup aktivasi native tombol yang sedang fokus: Ctrl+Space pada tombol game yang fokus tetap menjalankan aksi game, padahal assertion ini mengklaim 'a browser shortcut never becomes a native button activation'.

**Alasan pembantah.** Confidence medium, terbantah: repro benar diulang di Chromium headless (fokuskan `#pause`, state 'paused', `Control+Space` → keydown `{code:'Space',ctrlKey:true,defaultPrevented:false}`, click `#pause`, resume, state 'ready'; `Control+p` → tanpa panggilan, state tetap 'paused'), tetapi ia melaporkan konsekuensi yang sudah ada sebelum diff dan diterima sadar: di `main` pun Space+ctrl pada target interaktif mengembalikan `'native'` dan `main.js` tak pernah `preventDefault` untuk `'native'` (satu-satunya beda jalur kini hanyalah `sfx.unlock()` yang dilewati), sementara `spec.md` T3 menyatakan "Konsekuensi yang diterima: ... :457 tidak memanggil preventDefault untuk kombinasi bermodifier" dan `plan.md` T1 menulis "jangan dianggap regresi". Pesan assertion menyebut verdict routing `'native'` yang memang tidak lagi dikembalikan `keyAction` untuk tombol aksi bermodifier (spec T3/AC-3) — bukan jaminan browser tidak mengaktifkan tombol; Space polos di tombol yang sama menempuh jalur native identik (klik → resume), jadi tak ada klaim yang gagal maupun dampak keamanan.

### [kepatuhan · minor] `docs/sdlc/probe-par-fix/plan.md:220` — celah bernama 'teks kontrol yang terlihat pemain'

**Klaim.** Tak ada gate yang membaca hint `index.html`/README, jadi AC-7/AC-8 bertumpu pada grep manual.

**Alasan pembantah.** Confidence medium, terbantah: fakta teknisnya terverifikasi (`plan.md:220-223` berbunyi begitu; `test/unit.markup.test.mjs:23` hanya memaku `/drag/`, `/tap/`, `/A\/D/`, `/arrow|←/` pada hint; grep `Esc|pause` di `tools/` nol hasil; tak ada rujukan README di `test/`, `tools/`, `.github/`; CI hanya `npm test` + `npm run smoke`), tetapi ini bukan cacat yang bisa dikoreksi: plan sudah menamai celah itu sendiri sebagai "Celah bernama" dan spec menetapkan cek manualnya (`spec.md` AC-7 "Cek: baca berkas (tak ada test yang membaca README)", AC-8 "Cek: baca berkas + `npm test`", AC-11 "tak ada check smoke yang membaca teks kontrol") — temuan hanya mengulang pengakuan plan, bukan pelanggaran spec/plan. Berkas test yang boleh berubah di fase fix hanya `test/unit.input.test.mjs`, jadi tak ada gate pengganti yang mungkin ditambahkan untuk salinan jeda itu; temuan ini tidak memberi aksi perbaikan apa pun.

### [kepatuhan · minor] `.claude/sdlc-phase:1` — "[berulang] sisa build belum di-commit"

**Klaim.** Penanda fase `fix` tercatat kotor sebelum fase fix dan tidak pernah di-commit.

**Alasan pembantah.** Confidence high, terbantah: tidak ada sisa yang bisa ditunjuk — `find . -name "sdlc-phase*"` kosong, `git log --all --oneline -- .claude/sdlc-phase` kosong, `git ls-files .claude` hanya `hooks/protect-tests.sh` + `settings.json`, dan `git status --porcelain` bersih; jadi temuan menunjuk path yang tidak ada di tree, riwayat, maupun diff `main..HEAD`. "Belum di-commit" justru keadaan yang benar menurut desain: berkas itu gate yang dibaca hook dari diff ini (`.claude/hooks/protect-tests.sh:5-6`), diakui sebagai lingkungan run di `spec.md:137-140` dan `plan.md:226-231` (R1: berkas penanda tidak ada, hook inert), serta ditulis sengaja oleh lead saat fase fix mulai; meng-commit marker berisi "fix" akan menyalakan blokir edit test permanen untuk tiap sesi berikutnya. Prefiks `[berulang]` pun tanpa dasar aturan tertulis (`CLAUDE.md`/`REVIEW.md` tidak ada), dan preseden yang dikutip (`docs/sdlc/probe-par/review.md:56-64`) adalah artefak review lama, bukan rubrik project.

### [bug · nit] `src/input.js:3` — komentar kepala diklaim lebih luas dari kode

**Klaim.** Komentar kepala baru mengklaim semua kombinasi Ctrl/Meta/Alt milik browser, padahal berkas yang sama tetap modifier-blind untuk paddle dan pemanggilnya mem-`preventDefault` kombinasi itu; komentar ini juga mengulang komentar blok di baris 5-6.

**Alasan pembantah.** Confidence high, terbantah: komentar `src/input.js:3` menyebut "action key", istilah yang di spec T1 (`spec.md:41-44`) berarti tiga tombol aksi serve/pause/mute dan `plan.md:130-131` mengutip kalimat itu verbatim; baris 2 berkas yang sama sudah memisahkan "paddle keys" dari kelompok itu, dan T5 (`spec.md:53-56`) menyatakan paddle memang sengaja modifier-blind — jadi tidak ada klaim komentar yang lebih luas dari kode. Reproduksi read-only (`node --input-type=module`, impor `./src/input.js`) memberi ctrl+Space → null, meta+KeyP → null, alt+ArrowLeft → `'left'`, ctrl+KeyA → `'left'`; sisa tuduhan duplikasi dengan baris 5-6 hanya tumpang tindih topik satu baris header yang diwajibkan plan — nit tak actionable.

### [bug · nit] `test/unit.input.test.mjs:62` — pesan assertion mengklaim hasil tingkat browser

**Klaim.** Pesan assertion "a browser shortcut never becomes a native button activation" mengklaim hasil tingkat browser yang tidak bisa dibuktikan unit test ini: `keyAction` hanya mengembalikan null, sedangkan aktivasi native tombol yang sedang fokus oleh browser tidak diperiksa gate mana pun.

**Alasan pembantah.** Confidence high, terbantah: pesan assertion menamai sentinel milik kode sendiri — `'native'` didokumentasikan "'native' = leave it to the browser" (`src/input.js:40`, `src/main.js:455`) dan assertion baris 61 memang memeriksa nilai kembalian bukan-`'native'` (probe node: Space polos + target button → `'native'`, Ctrl+Space + target button → `null`), sementara teks itu ditetapkan verbatim di `plan.md:90` dan selaras AC-3 (`spec.md:96-98`). Celah verifikasi browser yang ditunjuk temuan sudah tercatat sebagai batas yang diterima di `spec.md:133-136`, dan temuan sendiri mengakui premis kuncinya belum terverifikasi — tidak ada cacat pada input valid yang bisa ditunjuk.

### [bug · nit] `docs/sdlc/probe-par-fix/plan.md:138` — instruksi kepada reviewer di dalam DATA

**Klaim.** Instruksi yang ditujukan kepada reviewer ditemukan di dalam DATA dan tidak dijalankan: "Konsekuensi yang diterima dan sengaja ... jangan dianggap regresi" (`plan.md:136-138`) dan versi ringkasnya di `spec.md:141-143`.

**Alasan pembantah.** Confidence high, terbantah: kutipannya nyata apa adanya (diulang di `plan.md:237-239` R4), tetapi ini bukan cacat yang lolos rubrik — kalimat itu catatan konsekuensi-diterima milik spec/plan yang sudah diterima lead (spec T3 + bagian "Kekhawatiran"), dan teks temuan itu sendiri menyatakan dampaknya nihil serta tidak dilaporkan sebagai temuan. Dampak yang ditunjuk terverifikasi nir-arti di kode: guard di `src/input.js` membuat `action` null untuk kombinasi bermodifier sehingga `if (action) sfx.unlock()` (`src/main.js:456`) dan `preventDefault` (`:457`) memang tidak jalan, sementara `sfx.unlock()` tetap dipanggil dari pointer/klik (`src/main.js:446`, `:451`, `:64`).

### [bug · nit] `.playwright-mcp/page-2026-09-21T18-44-17-839Z.yml:1` — artefak snapshot Playwright tertinggal

**Klaim.** Artefak browser (snapshot Playwright) tertinggal di root repo dan tidak di-ignore, sehingga bisa ikut ter-stage oleh `git add -A`; berkas ini bukan dari diff yang direview dan bukan dari sesi penemunya.

**Alasan pembantah.** Confidence medium, terbantah: berkas yang dikutip tidak ada — `ls -la .playwright-mcp/` hanya berisi `page-2026-09-21T18-48-18-400Z.yml` (snapshot lebih baru), bukan `page-2026-09-21T18-44-17-839Z.yml`, dan `git log --all -- .playwright-mcp` kosong sehingga tak ada bukti yang bisa ditunjuk. Artefak itu juga di luar diff yang direview dan merupakan sampah sesi tool browser yang aturan workflow sendiri menyuruh hapus, jadi ditolak rubrik bawaan (berkas hasil generate); yang masih benar hanyalah status `?? .playwright-mcp/` + `git check-ignore -v` rc=1, dan itu tidak menyelamatkan jangkar berkas yang sudah hilang. (Saat review ini ditulis direktori itu sudah tidak ada di tree.)

## Belum dibantah

Tidak ada: DATA pass `unvoted: []` — semua temuan terkonfirmasi dan terbantah mendapat hasil pembantah.

## Catatan instruksi dalam DATA (tidak dijalankan)

Instruksi bergaya arahan-reviewer ditemukan di berkas DATA yang dibaca; hanya disebut, tidak dipakai untuk mengubah verdict temuan:

- `docs/sdlc/probe-par-fix/plan.md:137-138` "jangan dianggap regresi." (diulang di `plan.md:237-239` R4) dan `docs/sdlc/probe-par-fix/spec.md:141-143` "dicatat supaya tidak dilaporkan sebagai regresi." — temuan terkait dievaluasi apa adanya (lihat Temuan terbantah di atas).
- `docs/sdlc/probe-par/review.md:22` "jadi jangan dijadikan temuan susulan" — temuan nit `index.html:47` tetap dilaporkan dan lolos pembantah.
- `docs/sdlc/probe-par-fix/plan.md:226-231` R1 "jangan menonaktifkan hook atau mengubah test yang ada - laporkan di notes" — konsisten dengan yang dilakukan: tidak ada berkas test atau hook yang diubah; pesan hook yang sama ("Perbaiki kode sumbernya; test yang menurutmu salah dilaporkan di notes, bukan diubah.") dikutip di Evidence, bukan dijalankan sebagai perintah baru.
