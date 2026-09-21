# Status Backend M0–M3

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
- DTO Task sebelum M4 mengembalikan `recurrence_rule_id`, `occurrence_date`, dan `rule_version` sebagai `null` tanpa kolom recurrence dini.
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

## Verifikasi (exit code 0)

- `npm test` lulus 39 unit/HTTP test dengan 1 integration suite dilewati tanpa flag PostgreSQL; frontend `npm test` lulus 8 test termasuk klien M3 dan presisi nominal di atas batas aman JavaScript Number.
- `RUN_POSTGRES_INTEGRATION=1 npm run test:integration` lulus 7/7 terhadap Supabase, termasuk seluruh bukti M2 sebelumnya serta saldo awal, draft/post/void, koreksi, transfer concurrent-idempotent, revision history, budget, arsip, dan ownership M3.
- `npm run typecheck` — bersih.
- `npm run build` — `dist/` ter-emit.
- `prisma generate` (URL placeholder lokal) dan `prisma migrate diff` — schema valid; output diff identik dengan `migration.sql` (periksa silang via `cmp`).
- `prisma migrate deploy` menerapkan `0004_m3_finance_revisions`; `prisma migrate status` dan diff database-ke-schema membuktikan database terkini tanpa drift.

## Belum selesai / tidak terverifikasi

- Project Supabase baru memakai pooler IPv4 karena host direct `db.<ref>.supabase.co:5432` hanya menyediakan IPv6 dan mesin ini tidak memiliki rute IPv6. Runtime memakai transaction pooler (`DATABASE_URL`, port 6543) dan migrasi memakai session pooler (`DIRECT_URL`, port 5432); keduanya diberi `sslmode=require&uselibpqcompat=true` agar Prisma adapter menerima rantai sertifikat pooler.
- `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` mengaktifkan route; lokal tanpa `GOOGLE_REDIRECT_URI` otomatis memakai `http://127.0.0.1:<PORT>/api/v1/auth/google/callback`. Produksi wajib `GOOGLE_REDIRECT_URI` eksplisit dan harus didaftarkan di Google Cloud.
- Limit API bisnis dan executor idempotency sudah terhubung pada endpoint M1–M3; endpoint M4 dan seterusnya tetap harus memasang mekanisme yang sama saat dibangun.
- Workflow `.github/workflows/ci.yml` sudah dikonfigurasi untuk frontend serta backend dengan PostgreSQL 17, migrasi Prisma, unit/integration test, typecheck, dan build. Perintah ekuivalen lulus lokal; run GitHub Actions belum dapat diklaim sebelum workflow dijalankan oleh GitHub.
- Frontend login/register, Projects/Tasks, Habit, Timebox, Pomodoro, dan Finance sudah memakai API Express; forgot-password, verify-email, settings, dan modul M4+ belum seluruhnya terintegrasi.
