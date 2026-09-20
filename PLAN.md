# Rencana Implementasi Tracker

Versi 0.4. Tanggal: 20 September 2026. Status: rencana backend/modul bisnis; kelulusan tiap tahap harus dibuktikan terpisah dari UI yang sudah tersedia. Dokumen ini merencanakan pembangunan aplikasi; belum ada jadwal rilis atau estimasi tenaga. Revisi 0.4 menyesuaikan fondasi ke stack nyata (SPA Vite + API Node + Supabase, auth custom); lihat DECISIONS D-40..D-45. Tahap, migrasi, dan syarat selesai tidak berubah selain penyedia framework/DB.

## Tahapan dan dependensi

| Tahap | Pekerjaan dan hasil | Dependensi | Syarat selesai |
|---|---|---|---|
| M0: Fondasi dan akun | SPA Vite/React (sudah ada) + API Node Express/TypeScript/lockfile; Supabase PostgreSQL/Prisma; identitas/sistem termasuk AuthLinkIntent; tabel PomodoroDay dan State awal saat registrasi, Day dibuat lazy; UI Inggris; logout semua perangkat termasuk perangkat aktif; Google (library OIDC)+email/password; SMTP/outbox; verify/reset/link; authorization,CSRF,rate limit,version/idempotency; CI | Dokumen konsisten | Typecheck/build selesai; Google/login/link intent dan login email/password smoke test membuktikan versi kompatibel; T-01/T-17 dan subset fondasi T-02 lulus |
| M1: Proyek,tugas,sejarah | Project/Task/TaskEvent; CRUD/status/arsip; event atomik; daftar/Kanban/filter/progres; DTO recurrence null tanpa kolom aturan | M0 | T-03/T-06 dan histori T-13 subset tugas lulus; reopen/pindah/rename tidak menghapus event; migrasi tanpa referensi M4 |
| M2: Kebiasaan, Pomodoro, dan Timebox | Habit/jadwal/check-in/archived_on; PomodoroSession/Interval menaut Day; state/siklus harian/rollover/deadline; TimeboxEntry/rencana dashboard tanpa Finance; pause/resume/cancel; worker rekonsiliasi; blokir transisi Task/Project; reload/offline | M1 | T-04/T-05/T-18 serta subset fokus T-13 lulus; lintas tengah malam, pergantian zona, dan reuse Day terbukti; dua request/worker memfinalisasi sekali; pause tidak menghabiskan sisa; deadline terlambat tidak menambah waktu |
| M3: Keuangan dan revisi | FinanceAccount/BalanceChange/Category/Transaction/Revision/Budget tanpa recurrence; saldo/transfer/draft/post/void; form kategori; history revisi | M0,M1 kerangka UI | T-08..T-11 lulus; revision dan saldo commit bersama; transfer rollback/retry tepat; koreksi/void dapat ditelusuri |
| M4: Kemampuan pengulangan modul dan dependensi | Rule/RuleRevision dahulu; ALTER Task/Transaction metadata nullable/unique/FK; TaskDependency; worker catch-up; version konfigurasi terpisah cursor; edit/stop/expiry; history versi di Tasks/Finance | M1,M3 | T-07/T-12 lulus; migrate dari M3 populated tanpa fake event; occurrence/revision/cursor atomik; worker tidak membuat VERSION_CONFLICT konfigurasi |
| M5: Integrasi laporan/CSV dalam modul | Event counts/tugas unik; interval overlap fokus terminal; jadwal/arsip habit; current finance/revision; budget basis bulan penuh; tab/aksi ringkasan dan CSV pada modul sumber tanpa halaman/menu mandiri | M2,M3,M4 | T-13/T-14 lulus terhadap fixture independen; pemindahan proyek tetap pada snapshot; CSV milidetik dapat direkonsiliasi ke total |
| M6: Penerimaan dan rilis | UI setelah arah visual tersedia; loading/error/offline; QA keyboard/responsif; CI lengkap; staging; backup/restore; health/log/alarm | M0..M5 | Semua T-01..T-18 lulus; build selesai; Google/SMTP staging terbukti; restore berhasil; tidak ada klaim runtime tanpa bukti |

M3 tidak membutuhkan Pomodoro, tetapi membutuhkan identitas dan kerangka UI. Default pengerjaan tetap M0 sampai M6. Penyempurnaan dokumen saat ini tidak mencakup coding atau deployment.

## Urutan migrasi yang wajib

| Migrasi | Tabel/perubahan | Aturan kompatibilitas |
|---|---|---|
| 0001 (M0) | User,AuthAccount,AuthToken,AuthLinkIntent,EmailOutbox,IdempotencyRecord,RateLimitBucket,PomodoroDay,PomodoroState | Day sebelum State; State cycle_day_id awal null; create user dan state atomik |
| 0002 (M1) | Project,Task,TaskEvent | Task belum memiliki recurrence FK; event created untuk setiap task baru |
| 0003 (M2) | Habit,HabitSchedule,HabitCheckIn,PomodoroSession,PomodoroInterval,TimeboxEntry | Session mengarah Day M0; Timebox dibuat setelah Habit; User/Task/Project sudah tersedia; tidak ada FK State ke Session |
| 0004 (M3) | FinanceAccount,FinanceAccountBalanceChange,Category,FinanceTransaction,FinanceTransactionRevision,Budget | Transaksi/revisi tanpa kolom aturan; create awal menambah revision |
| 0005 (M4) | TaskRecurrenceRule,FinanceRecurrenceRule,kedua RuleRevision,TaskDependency; ALTER Task/FinanceTransaction | Tambah recurrence_rule_id,occurrence_date,rule_version nullable; CHECK semua null/terisi, unique occurrence, FK rule dan versi setelah tabel tersedia |

Catatan manual lama tetap tiga metadata null. Jangan membuat occurrence,event,atau revision historis palsu saat upgrade. Snapshot FinanceTransactionRevision sebelum M4 tetap tersimpan; mapper read mengartikan key metadata recurrence yang belum ada sebagai null. Terapkan semua migrasi berurutan pada DB kosong dan dari DB M3 berisi fixture. Rollback aplikasi harus kompatibel dengan kolom additive; jangan reset DB produksi.

## Penyesuaian kontrak 0.3

Timebox menjadi REQ-18/T-18 di M2. PomodoroDay dibuat sebelum State di M0 agar M2 tidak memerlukan FK ke tabel masa depan. Bila backend telah memiliki skema/riwayat Pomodoro dari versi lain, buat migrasi additive tersendiri setelah memeriksa migrasi aktual; jangan mengubah migrasi yang sudah diterapkan. Backfill Day dari started_at dan zona historis yang tersedia; jika zona historis tidak tersimpan, dokumentasikan asumsi zona dan keterbatasannya, jangan mengklaim snapshot asli. State hari ini dihitung dari sesi completed teratribusi, dengan sesi terbuka tetap pada Day asal.

M5 adalah tahap integrasi kemampuan turunan, bukan fitur/menu mandiri. API pengulangan berada di Tasks/Finance; report/export memakai namespace modul sumber. Migrasi dan smoke test backend harus mengikuti kontrak baru sebelum UI dihubungkan.

## Cara mengerjakan tiap tahap

1. Petakan REQ/T dan tabel/transisi terkait. Jika perubahan perilaku diperlukan, perbarui PRD/SCHEMA/API/UX/DECISIONS bersama.
2. Buat migrasi/constraint lalu service domain yang dipakai API dan worker; seluruh mutasi mengunci User terlebih dahulu.
3. Implementasikan DTO/API eksplisit dan integration test PostgreSQL; event/revisi merupakan bagian transaksi, bukan pekerjaan worker susulan.
4. Implementasikan UI menurut UX-FLOWS; ikuti DESIGN dan susunan wireframe, dengan keputusan PRD 0.3 sebagai acuan perilaku. Jangan membuat halaman mandiri pengulangan/laporan/CSV atau mengisi dashboard dengan rincian keuangan.
5. Jalankan check relevan, simpan command/exit code/log selesai, dan perbarui status hanya sesuai bukti.

Gunakan fixture dengan ekspektasi yang dihitung independen, bukan tes yang sekadar menyalin implementasi. Completed Pomodoro tidak otomatis menyelesaikan Task; job recurrence tidak memulai Pomodoro.

## Environment dan rollout

M0 menentukan versi paket kompatibel, konfigurasi environment, callback Google, SMTP sink, dan secret store. Vendor/domain produksi dapat diselesaikan saat persiapan staging; jangan menjadikannya alasan menunda service lokal. Arah visual dibutuhkan sebelum UI final, bukan sebelum schema/service.

Rilis pertama memakai release job migrasi sekali, SPA/API/worker, HTTPS, smoke test akun/tugas/fokus/transfer/laporan di staging, dan bukti restore DB staging sebelum produksi sesuai otorisasi rilis. Pantau Pomodoro due terlambat >10 detik, aturan backlog >10 menit tanpa blokir domain, heartbeat worker, outbox failed, dan error server. Sesi paused bukan backlog deadline.

## Definition of done

- Constraint/migrasi dapat diterapkan pada DB kosong dan upgrade berisi data; tidak ada FK ke tahap masa depan.
- DTO/filter/version/status sesuai API; seluruh transisi dari PRD memiliki kasus uji.
- Event/revisi/interval final tetap immutable; pembatalan/rename/reopen tidak menghapus fakta historis.
- Unit/integration/E2E terkait lulus, typecheck/lint/production build selesai dengan exit code sukses.
- QA keyboard/responsif mencakup descendant, form, dialog, tabel, dan state gagal.
- Status membedakan dokumentasi diperiksa, aplikasi telah diuji, dan pekerjaan yang belum terverifikasi.
