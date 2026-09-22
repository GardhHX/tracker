# Status Backend M0–M5 dan fondasi M6

Diperbarui: 22 September 2026. Status membedakan bukti perintah otomatis dari uji manual yang dilaporkan pengguna; tidak ada klaim runtime tanpa salah satu dari kedua sumber tersebut.

## Sudah terimplementasi (M0, identitas & sistem)

- Schema Prisma M0: `User`, `AuthAccount`, `AuthToken`, `AuthLinkIntent`, `EmailOutbox`, `IdempotencyRecord`, `RateLimitBucket`, `PomodoroDay`, `PomodoroState` (`prisma/schema.prisma`).
- Migrasi `0001_m0_foundation` dihasilkan dari schema via `prisma migrate diff` (bukan SQL manual) + `migration_lock.toml`, lalu berhasil diterapkan ke project Supabase baru.
- Entrypoint `src/server.ts` (Express + Prisma + security nyata, graceful shutdown SIGINT/SIGTERM).
- Endpoint: `GET /auth/csrf`, `POST /auth/register`, `POST /auth/login`, `POST /auth/verify-email`, `POST /auth/resend-verification`, `POST /auth/forgot-password`, `POST /auth/reset-password`, `GET /me`, `PATCH /me` (version check, verified-only), `POST /auth/logout-all`, `POST /auth/password-setup/request` (verified + reauth <= 10 menit, Google-only), `POST /auth/password-setup/confirm` (token sekali pakai terikat user, cabut sesi).
- Google OAuth (`openid-client` v6, Authorization Code + PKCE S256, state + nonce) di `GET /auth/google/start`, `GET /auth/google/callback`, `POST /auth/link/google` (verified + reauth), `DELETE /auth/link/google` (verified + reauth, password wajib). Transaksi OAuth disimpan di cookie terenkripsi AES-256-GCM + bertanda tangan HMAC, HttpOnly, path `/api/v1/auth/google`, sekali pakai. Token exchange memakai redirect URI terdaftar (`GOOGLE_REDIRECT_URI`), bukan Host header. Auto-link email dilarang: email yang sudah punya akun → redirect `/login?error=link_required`, tidak pernah menjadi registrasi/login baru.
- `/me` MeVerified kini mengembalikan `providers` nyata dan `has_password` dari data `AuthAccount`/`User`.
- Keamanan: session JWT HttpOnly/SameSite=Lax max 7 hari (jose), `session_version` dicek ke DB tiap akses protected (termasuk callback link), CSRF terikat sesi/pre-session, Argon2id, token disimpan sebagai hash, payload outbox disegel AES-256-GCM, error contract + `X-Request-Id`, rate limit login 10x/15 menit per IP+email, serta pengiriman email 3x/jam per email dan 20x/jam per IP dengan `Retry-After` 429.
- Rate limit produksi memakai `rate_limit_bucket` PostgreSQL dengan UPSERT atomik. Kunci email/IP di-HMAC sebelum disimpan, bucket kedaluwarsa dibersihkan berkala, dan smoke test Supabase membuktikan urutan allow/allow/deny serta count persisten 3.
- Executor idempotency PostgreSQL tersedia untuk endpoint bisnis: validasi key 8..128, hash payload kanonik, advisory transaction lock, replay respons sukses 24 jam, `IDEMPOTENCY_CONFLICT` untuk payload/route berbeda, dan penyimpanan respons dalam transaksi yang sama dengan mutasi domain. Worker membersihkan record idempotency serta bucket rate-limit kedaluwarsa setiap jam. Endpoint auth tidak memakai key sesuai API-SPEC; endpoint bisnis yang wajib memakai executor belum dibangun.
- Origin frontend yang diizinkan menerima CORS credentialed dan preflight `OPTIONS`; origin lain tetap ditolak sebelum autentikasi.
- Repository di-abstrak (`AuthRepo`): adapter Prisma untuk produksi, in-memory untuk test; `createUserWithState` dan `consumePasswordSetupToken` atomik dalam transaksi.
- Kontrak sesuai API-SPEC: register/verify/resend/forgot memberi respons umum (anti-enumeration), reset mencabut semua sesi, verifikasi 24 jam, reset 30 menit.
- Worker email terpisah tersedia melalui `npm run dev:worker` atau `npm run start:worker`: klaim batch atomik memakai lease + `SKIP LOCKED`, console sink lokal atau SMTP, retry exponential, graceful shutdown, dan pembersihan payload token setelah sent/gagal permanen.
- Google OAuth dan pengiriman SMTP nyata dinyatakan lulus uji manual oleh pengguna pada 21 September 2026. Bukti ini dicatat sebagai verifikasi manual pengguna, terpisah dari suite otomatis repository.

## Sudah terimplementasi (M1, proyek, tugas, dan sejarah)

- Schema dan migrasi `0002_m1_projects_tasks_history`: `Project`, `Task`, `TaskEvent` beserta enum, composite ownership FK, indeks, length/state CHECK, serta urutan tanpa referensi ke tabel M4. Migrasi telah diterapkan ke database pengembangan Supabase.
- Endpoint verified-only: list/create/get/edit/status/soft-delete Project; list/create/get/edit/status/archive/unarchive/soft-delete Task; dan list TaskEvent. `DELETE` memakai `If-Match` dan mengarsipkan resource tanpa menghapus histori. Query mendukung pagination, status, priority, project/personal, overdue, rentang due date, serta arsip sesuai kontrak M1.
- Setiap mutasi Task nyata menambah tepat satu snapshot `TaskEvent` dalam transaksi yang sama. No-op tidak menaikkan version/timestamp dan tidak menambah event; reopen tidak menghapus completion lama; rename/move tidak mengubah snapshot lama.
- Create Project/Task memakai `Idempotency-Key` PostgreSQL dalam commit yang sama dengan resource dan event. API bisnis memakai rate limit 120 request/menit per user, sesi terverifikasi, CSRF, ownership isolation, dan optimistic version conflict.
- Project progress menghitung Task terkini yang tidak diarsipkan. Complete ditolak selama ada tugas terbuka; archive tidak mengarsipkan tugas; Task pada Project nonaktif read-only sampai Project dibuka kembali.
- Data Task manual M1 tetap memakai `recurrence_rule_id`, `occurrence_date`, dan `rule_version` bernilai `null`; metadata itu menjadi aktif untuk occurrence M4.
- Frontend `/tasks` dan `/projects` memakai API persisten yang sama, bukan seed tab; mencakup loading/error/empty state, edit/status/arsip, filter, List/Kanban, progres, dan history completion berbasis snapshot.

## Sudah terimplementasi (M2, kebiasaan, Pomodoro, dan Timebox)

- Schema dan migrasi `0003_m2_habits_pomodoro_timebox` menambah Habit/Schedule/CheckIn, PomodoroSession/Interval, dan TimeboxEntry dengan ownership FK komposit, CHECK, indeks, serta partial unique untuk satu sesi dan interval terbuka.
- Endpoint Habit mencakup CRUD yang diizinkan kontrak, jadwal efektif besok yang mempertahankan sejarah, check-in idempotent, koreksi historis, dan arsip terminal dengan zona kalender tetap.
- Endpoint Timebox mencakup list per tanggal lokal, create/edit/cancel, tautan Task/Habit terverifikasi, Focus tepat 25 menit, serta overlap informatif tanpa menjalankan aktivitas.
- Pomodoro memakai deadline server, interval aktif, pause/resume/cancel, fase berikut manual, hitungan fokus per PomodoroDay, rollover zona saat idle, reuse Day, serta rekonsiliasi oleh request dan worker.
- Perubahan Task selesai/pindah/arsip serta Project selesai/arsip ditolak dengan `POMODORO_IN_PROGRESS` ketika fokus terkait masih running/paused setelah rekonsiliasi deadline.
- Frontend `/dashboard`, `/habits`, dan `/pomodoro` membaca dan memutasi data API persisten; timer mengoreksi jam perangkat memakai `meta.server_now` dan memulihkan state server setelah reload.

## Sudah terimplementasi (M3, keuangan dan revisi)

- Schema dan migrasi `0004_m3_finance_revisions` menambah akun, perubahan saldo awal, kategori, transaksi, revision snapshot immutable, dan anggaran dengan BIGINT rupiah serta FK ownership komposit.
- Endpoint `/finance/accounts`, `/finance/categories`, `/finance/transactions`, dan `/finance/budgets` mencakup list/create/get/edit/archive, balance history, draft/post/void, transfer, revision history, serta create/edit/delete budget sesuai kontrak M3.
- Saldo dihitung dari opening balance dan transaksi posted terkini. Draft/void tidak memengaruhi saldo; transfer memakai satu baris dengan dua efek; koreksi posted dan void langsung tercermin tanpa menulis ulang revision lama.
- Create resource dan post draft yang memerlukan idempotency memakai executor PostgreSQL yang menyimpan respons dalam transaksi domain yang sama. Nominal selalu keluar sebagai string agar tidak kehilangan presisi di JavaScript.
- Frontend `/finance/accounts` memakai API persisten, menampilkan loading/error/empty state, dan mendukung akun, kategori, transaksi, transfer, koreksi/void, revision history, serta anggaran tanpa seed data.

## Sudah terimplementasi (M4, pengulangan dan dependensi)

- Migrasi additive `0005_m4_recurrence_dependencies` menambah Task/Finance recurrence rule dan revision immutable, TaskDependency, serta tiga metadata occurrence nullable pada Task/FinanceTransaction. Constraint memastikan ketiga metadata terisi bersama atau seluruhnya null, occurrence unik per rule/tanggal, ownership FK komposit, dan data M3 lama tidak dibackfill sebagai fakta palsu.
- Endpoint verified-only Tasks dan Finance mencakup list/create/get/edit/stop rule, occurrence/revision history, serta list/set/delete dependency. Create rule memakai idempotency executor; edit/stop memakai version konfigurasi tanpa menaikkan versi dari worker.
- Worker setiap menit melakukan catch-up date rule daily/weekly/monthly, membuat occurrence dan event/revision domain secara atomik, menandai rule tugas yang terblokir proyek nonaktif, meng-expire rule yang selesai, membatasi batch mutasi 100 occurrence, dan membuat FinanceTransaction recurring sebagai draft.
- Completion/reopen Task dan archive account/category memeriksa dependency/recurrence aktif. Dependency harus satu Project aktif milik user, menolak self/cycle, dan completion ditolak bila predecessor belum done.
- Frontend mengintegrasikan rule dan history ke `/tasks` dan Transactions di `/finance/accounts`; dependency muncul dalam detail tugas proyek. Tidak ada menu atau halaman recurrence terpisah.

## Sudah terimplementasi (M5, laporan dan CSV dalam modul)

- Tidak ada tabel atau migrasi M5. Service `modules/m5` menghitung laporan langsung dari TaskEvent immutable, interval Pomodoro terminal, jadwal/check-in Habit historis, FinanceTransaction posted terkoreksi, dan Budget yang sudah ada.
- Endpoint verified-only tersedia untuk summary dan CSV pada Tasks, Project detail, Habits, Pomodoro, dan Finance. Semua memakai `from`/`to` inklusif dalam zona pengguna, default bulan berjalan sampai hari ini, batas 366 hari, serta `Cache-Control: private, no-store` dari middleware API.
- Laporan Task membedakan completion event dan unique task dari snapshot Project. Laporan Pomodoro menghitung overlap interval focus dalam milidetik sebelum floor detik sekali, serta memisahkan sesi completed dan cancelled. Habit memakai jadwal efektif dan archived_on dalam zona tetap. Finance memakai transaksi posted terkini, sedangkan Budget tetap memakai seluruh bulan kalender.
- CSV mengikuti range summary, disusun sebagai attachment UTF-8 tanpa menu terpisah, dibatasi 10000 baris sebelum body dikirim, dan menetralkan teks yang dapat ditafsirkan sebagai formula spreadsheet. Projects dan Finance meminta section eksplisit sesuai kontrak.
- Frontend menambahkan panel laporan yang memuat range, loading/error/empty state, dan aksi CSV nyata pada `/tasks`, detail `/projects`, `/habits`, `/pomodoro`, serta `/finance/accounts`. Tidak ada route atau menu laporan mandiri.

## Verifikasi (exit code 0)

- Backend `npm test` lulus 50 test dan satu suite integration tetap dilewati tanpa flag PostgreSQL; frontend `npm test` lulus 11 test termasuk klien M5 dan presisi nominal di atas batas aman JavaScript Number.
- `RUN_POSTGRES_INTEGRATION=1 npm run test:integration` lulus 9/9 terhadap Supabase, termasuk recurrence Task/Finance, revision versi konfigurasi, catch-up, draft occurrence, dependency block/cycle, archive resource yang masih dipakai rule aktif, serta ringkasan/CSV M5.
- `npm run typecheck` — bersih.
- `npm run build` — `dist/` ter-emit.
- `prisma generate` (URL placeholder lokal) dan `prisma migrate diff` — schema valid; output diff identik dengan `migration.sql` (periksa silang via `cmp`).
- `prisma migrate deploy` menerapkan `0005_m4_recurrence_dependencies`; `prisma migrate status` dan diff database-ke-schema membuktikan database terkini tanpa drift.

## Diimplementasikan lokal untuk M6, belum menjadi rilis

- API menyediakan `GET /api/v1/healthz` untuk liveness proses dan `GET /api/v1/readyz` untuk readiness PostgreSQL. Readiness mengembalikan 503 bila probe dependency gagal tanpa membocorkan detail koneksi.
- API mencatat event JSON `http_request` berisi request ID, method, status, dan durasi. Error tak terduga serta kegagalan readiness menjadi event JSON tanpa request body, token, catatan, atau transaksi.
- Worker mencatat JSON untuk start/stop, batch email, rekonsiliasi Pomodoro, recurrence, cleanup, dan `worker_heartbeat` sekali per menit.
- Frontend mendaftarkan rute Habits dan Pomodoro yang sebelumnya ditautkan tetapi belum ada di router. Status offline eksplisit memberi tahu pengguna bahwa data mungkin belum baru dan mutasi API ditolak sebelum request dikirim.
- Playwright memeriksa menu ponsel dengan keyboard/focus return, status offline, dan tidak ada horizontal overflow pada Dashboard, Tasks, Habits, Pomodoro, Projects, serta Finance di 360/768/1440 px. Workflow CI memasang Chromium dan menjalankan suite tersebut.
- Verifikasi lokal terbaru: frontend `npm test` 11/11, `npm run typecheck`, `npm run build`, dan `npm run test:e2e` 3/3; backend `npm test` 50 pass dengan 1 integration PostgreSQL skip tanpa flag, `npm run typecheck`, dan `npm run build` semuanya lulus.

M6 tidak dapat dinyatakan selesai hanya dari implementasi ini. Staging Google/SMTP, GitHub Actions pada commit rilis, vendor/domain/HTTPS, backup Supabase dan restore terisolasi, serta konfigurasi alarm eksternal masih membutuhkan akses dan otorisasi operator. Lihat `../ops/RELEASE-CHECKLIST.md`.

## Belum selesai / tidak terverifikasi

- Project Supabase baru memakai pooler IPv4 karena host direct `db.<ref>.supabase.co:5432` hanya menyediakan IPv6 dan mesin ini tidak memiliki rute IPv6. Runtime memakai transaction pooler (`DATABASE_URL`, port 6543) dan migrasi memakai session pooler (`DIRECT_URL`, port 5432); keduanya diberi `sslmode=require&uselibpqcompat=true` agar Prisma adapter menerima rantai sertifikat pooler.
- `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` mengaktifkan route; lokal tanpa `GOOGLE_REDIRECT_URI` otomatis memakai `http://127.0.0.1:<PORT>/api/v1/auth/google/callback`. Produksi wajib `GOOGLE_REDIRECT_URI` eksplisit dan harus didaftarkan di Google Cloud.
- Limit API bisnis sudah melindungi endpoint M5. Tidak ada mutasi pada M5, sehingga idempotency executor tidak relevan untuk endpoint report/export GET.
- Workflow `.github/workflows/ci.yml` sudah dikonfigurasi untuk frontend serta backend dengan PostgreSQL 17, migrasi Prisma, unit/integration test, typecheck, dan build. Perintah ekuivalen lulus lokal; run GitHub Actions belum dapat diklaim sebelum workflow dijalankan oleh GitHub.
- Frontend login/register, Projects/Tasks, Habit, Timebox, Pomodoro, Finance, serta laporan/CSV M5 memakai API Express. Forgot-password, verify-email, dan settings masih belum seluruhnya terintegrasi.
