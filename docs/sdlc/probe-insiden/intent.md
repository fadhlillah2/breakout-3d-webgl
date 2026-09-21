# Intent: kegagalan smoke CI state/score yang tidak dapat direkonsiliasi dengan riwayat run

Penulis: sdlc-maintain (jalur insiden, tier 2σ, slot model pelaksana caller), 2026-09-22. Status: draf.

## Masalah

Pemicu detektor (bands.yaml) melaporkan pembobolan band pada metrik `ci_test_failure_rate` (baseline `rolling_30d = 0.0`, aturan `western_electric` 2σ), jendela 2026-09-22 00:30-01:50 WIB: 3 dari 5 run CI terakhir gagal di job "smoke" (`npm run smoke`), unit test hijau di semua run. Ekor log yang dikutip pemicu untuk run #418, #419, #421, apa adanya:

> not ok state playing === ready   (expected "playing", got "ready")
> not ok score 290 === 0
> smoke: 2 checks failed (score, state) after 30000 ms - is the serve key handled?

Pemeriksaan saya sendiri di HEAD `89c3ce5` tidak menemukan gejala ini dan tidak dapat merekonsiliasi angka pemicu dengan repo/CI yang saya buka: riwayat run nyata tidak memuat run gagal dan nomor run CI maksimumnya #11 (jadi #417-#421 bukan milik repo ini), workflow CI tidak punya job bernama `smoke`, `tools/smoke.mjs` tidak dapat mencetak format ekor log di atas, dan pada mesin ini `npm test` (108/108) serta `npm run smoke` hijau. Detail dan sumber angka ada di "Bukti anomali"; penyebab alternatif yang belum tersingkir ada di "Pertanyaan terbuka".

## Bukti anomali

- Metrik/gejala (klaim pemicu, DATA): `ci_test_failure_rate`, baseline `rolling_30d = 0.0`, `western_electric` 2σ breached; 3/5 run CI terakhir gagal di job "smoke", unit test hijau di semua run; run yang lulus #417/#420 diklaim 37 cek hijau, durasi 6-7 s.
- Tier: 2σ (diagnosa read-only). Jendela pengamatan 3 hari: 2026-09-20 s/d 2026-09-22; sub-jendela laporan 2026-09-22 00:30-01:50 WIB (= 2026-09-21 17:30-18:50Z).
- Baseline vs yang diamati (yang saya buka sendiri):
  - Riwayat run GitHub (`gh run list --limit 40`, read-only, saya jalankan): 19 run, semuanya `conclusion: success` (11 `CI` + 8 `pages-build-deployment`); nomor run CI 1..11 tanpa celah, maksimum #11; tidak ada run dibuat antara 2026-09-21T15:36:43Z dan 18:57:12Z, jadi tidak ada run CI di dalam sub-jendela laporan. Tidak ada run gagal dan tidak ada run #417-#421.
  - `.github/workflows/ci.yml`: satu job `test` (`timeout-minutes: 10`) dengan dua langkah, `Unit tests` (`npm test`) dan `Browser smoke (Chrome headless, preinstalled on ubuntu-latest)` (`npm run smoke`); tidak ada job bernama `smoke`.
  - `tools/smoke.mjs`: pencetak cek `ok  `/`FAIL` (baris 76) dan ringkasan kegagalan `N smoke check(s) failed` (baris 176); tidak ada string `not ok`, `(expected ...)`, `got`, atau timeout `30000 ms`. Grep saya atas `tools/` + `ci.yml` hanya menemukan `timeout-minutes: 10` dan `60_000` ms di `tools/harness.mjs:81-84`. Templat label menaruh nilai aktual lebih dulu: `` state ${...} === ${expected.state} `` (baris 87-88). Label pemicu `state playing === ready` dan parenthetical `(expected "playing", got "ready")` saling meniadakan; `score 290 === 0` juga terbalik dari nilai harapan pada run yang sama. Jumlah cek adalah 37 (`grep -c '^  check(' tools/smoke.mjs`), jadi "37 cek" pada run yang lulus bukan pembeda.
  - Inkoherensi satu frame: pada `?autotest=1` skenario berjalan lalu frame dirender sekali secara sinkron (`src/main.js:549-562`); `data-draws`, `data-state`, dan `data-score` ditulis dari snapshot yang sama (`src/main.js:346-362`). Papan `ready` yang belum diservis menggambar 39 kubus (6 tetap + 32 brick hidup + 1 bola; `README.md` "39 of them on a fresh wall"; cek `tools/smoke.mjs:139-140`), sedangkan jalur default `?autotest=1` berakhir di state `playing` dengan skor 290 (hitung ulang saya via Node: `playTracking` → `{"state":"playing","score":290,"lives":3,"level":1,"bricksLeft":14}`, cocok dengan nilai harapan pemicu). Jadi "27 kubus" bersama `ready` + skor 0 tidak mungkin berasal dari satu render di kode ini.
  - Jalur QA tidak menyentuh keyboard: skenario dipanggil langsung dan `serve()` dipanggil oleh skenario (`src/autotest.js:19`), bukan lewat routing tombol; pertanyaan pemicu "is the serve key handled?" tidak menunjuk kode yang dieksekusi run smoke.
  - Lokal pada HEAD `89c3ce5` (saya jalankan): `npm test` → `# tests 108 / # pass 108 / # fail 0`; `npm run smoke` → 37/37 ok, baris akhir `all smoke checks passed (score 290, lives 3, level 1, 14 bricks left)`.
  - Satu klaim pemicu yang cocok: deploy Pages terakhir untuk `main` `89c3ce5` sukses (`pages-build-deployment` run #8, createdAt 2026-09-21T18:57:21Z = 01:57:21 WIB, head_sha `89c3ce5`).
- Sumber angka: (1) berkas pemicu `insiden.txt` (di luar project root, direktori scratchpad harness; 701 byte, mtime 2026-09-22 01:58) — DATA; (2) `gh run list --limit 40` (saya jalankan); (3) `npm test` dan `npm run smoke` lokal di HEAD; (4) berkas repo `.github/workflows/ci.yml`, `tools/smoke.mjs`, `tools/harness.mjs`, `src/main.js`, `src/autotest.js`, `README.md`, git log.
- Belum diperiksa: log lengkap run #417-#421 (tidak ada jejaknya di repo maupun di riwayat run; tidak tersedia), isi `bands.yaml` dan cara `ci_test_failure_rate` dihitung (`find` atas repo: nol hasil; detektor di luar repo), log per-langkah run CI (yang saya baca hanya daftar run `gh`, bukan log), reproduksi kegagalan 3-dari-5 (tidak dilakukan; gate lokal hijau).

## Hasil yang diinginkan

- Kembali ke baseline yang bisa diperiksa: 5 run CI berikutnya (dan seluruh jendela pengamatan) ber-conclusion `success`, langkah `Browser smoke` 37/37 ok, `Unit tests` 108/108, tanpa satu pun kegagalan.
- Kegagalan smoke yang benar-benar terjadi (bila ada) meninggalkan ekor log yang dapat diproduksi `tools/smoke.mjs` (`ok  `/`FAIL`, ringkasan `N smoke check(s) failed`) dan merujuk nomor run yang ada di riwayat GitHub Actions.
- Nilai frame QA koheren dan cocok dengan snapshot Node: `data-draws`, `data-state`, `data-score` dari satu render (mis. 27 kubus hanya sah bersama `state playing` dan skor 290).
- Angka pemicu dapat direkonsiliasi dengan sistem nyata: nomor run, nama job, dan asal ekor log pemicu diketahui; bila detektor membaca sistem lain, sumbernya disebut.
- Triage (terima/tolak) milik service owner; dokumen ini draf.

## User dan sistem terdampak

- CI repo (`.github/workflows/ci.yml`, job `test`, step `Browser smoke`) sebagai gerbang PR ke `main` dan deploy Pages (run `pages-build-deployment`).
- Maintainer/reviewer yang membaca status CI dan memutuskan lolos/tahan PR; pemain halaman Pages terdampak tidak langsung bila gate salah merah.
- Sistem yang diperiksa: `tools/smoke.mjs`, `tools/harness.mjs`, `src/autotest.js`, `src/main.js` (jalur QA `?autotest=1`), riwayat run GitHub Actions; detektor `bands.yaml` (di luar repo, belum diperiksa).

## Batasan

- Tier 2σ: tanpa usulan rute (field rute: "tidak ada (2σ)"); diagnosa read-only.
- Tindakan hanya lewat rute bergate: PR ke review gate atau runbook pra-disetujui, dengan keputusan service owner; run ini tidak push, PR, deploy, rollback, commit, maupun menghapus berkas.
- Satu-satunya berkas yang ditulis run ini: `docs/sdlc/probe-insiden/intent.md`.
- Klaim dibatasi pada yang dibuka sendiri; yang tidak dibuka ditulis "belum diperiksa".

## Pertanyaan terbuka

- Dari mana ekor log `not ok ... (expected "playing", got "ready")` dan `after 30000 ms` berasal, kalau tidak ada tool di repo ini yang bisa mencetaknya? (tool/versi lain, repo lain, atau parafrase sintetis) — belum tersingkir.
- Apakah nomor run #417-#421 dan job "smoke" ada di sistem lain (harness/detektor di luar repo)? Isi dan input `bands.yaml` belum diperiksa.
- Apakah flake Chrome runner (SwiftShader) mungkin? Tidak ada run gagal di riwayat yang bisa dibedah; belum terverifikasi.
- Apakah perbedaan lingkungan (CI node 22 vs lokal v20; Chrome runner vs Chrome lokal) menyembunyikan gejala yang tidak terlihat lokal?
- Apakah berkas pemicu di scratchpad (di luar repo, mtime 2026-09-22 01:58) adalah input sintetis harness, bukan kejadian produksi? Belum diperiksa.
- Bila detektor memakai data nyata, dari sumber mana ia membaca 5 run terakhir dan mengapa angkanya berbeda dari `gh run list`?

## Asumsi

- Angka pemicu (baseline 0.0, "3 dari 5", run #417-#421, kutipan ekor log) saya kutip sebagai DATA laporan detektor; yang saya verifikasi sendiri adalah riwayat `gh run list`, berkas repo, dan hasil run lokal.
- Riwayat `gh run list --limit 40` (19 run) adalah seluruh riwayat repo: jumlahnya < 40 dan penomoran CI 1..11 tanpa celah.
- Waktu WIB = UTC+7; `createdAt` `gh` dalam UTC.
- Jendela pengamatan 3 hari = 2026-09-20 s/d 2026-09-22.
- Smoke jalur `?autotest=1` deterministik dan hijau di mesin ini; ekstrapolasi ke runner CI tidak diasumsikan.
- "Kembali ke baseline" berarti langkah smoke ok di setiap run pada jendela, bukan lolos sekali.

## Usulan eval

Satu kasus regresi untuk suite eval project (play continuous evals): `smoke-frame-coherence`.

- Pemicu: nilai frame dari insiden — satu frame `?autotest=1` terlihat menggambar 27 kubus sementara `state`/`score` dilaporkan `ready`/0 (kombinasi yang mustahil dari satu render).
- Yang dijalankan: boot `?autotest=1` di Chrome headless lewat jalur yang sama dengan `tools/smoke.mjs`, lalu bandingkan `data-draws`, `data-state`, `data-score` dengan snapshot Node dari skenario `playTracking` yang sama.
- Pemeriksaan yang mendefinisikan sembuh: (1) `npm run smoke` 37/37 ok dan nol `FAIL`; (2) `state playing === playing`, `score 290 === 290`, `draws 27 === 27`, ketiganya dari satu frame; (3) kasus gagal bila dua nilai saling meniadakan (mis. 27 kubus + `ready` + skor 0) atau bila ada label kegagalan yang tidak dapat diproduksi `tools/smoke.mjs` (nilai aktual lebih dulu, ringkasan `N smoke check(s) failed`); (4) ambang: nol kegagalan dalam 5 run berurutan sesudah intent diterima.
- Sembuh = baseline yang bisa diperiksa: smoke hijau di setiap run dan nilai frame koheren, bukan sekadar alert berhenti.
