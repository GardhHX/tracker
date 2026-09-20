# Status Backend M0

Diperbarui: 20 September 2026. Status hanya berdasarkan bukti perintah yang dijalankan; tidak ada klaim runtime tanpa uji.

## Sudah terimplementasi (M0, identitas & sistem)

- Schema Prisma M0: `User`, `AuthAccount`, `AuthToken`, `AuthLinkIntent`, `EmailOutbox`, `IdempotencyRecord`, `RateLimitBucket`, `PomodoroDay`, `PomodoroState` (`prisma/schema.prisma`).
- Migrasi `0001_m0_foundation` dihasilkan dari schema via `prisma migrate diff` (bukan SQL manual) + `migration_lock.toml`, lalu berhasil diterapkan ke project Supabase baru.
- Entrypoint `src/server.ts` (Express + Prisma + security nyata, graceful shutdown SIGINT/SIGTERM).
- Endpoint: `GET /auth/csrf`, `POST /auth/register`, `POST /auth/login`, `POST /auth/verify-email`, `POST /auth/resend-verification`, `POST /auth/forgot-password`, `POST /auth/reset-password`, `GET /me`, `PATCH /me` (version check, verified-only), `POST /auth/logout-all`, `POST /auth/password-setup/request` (verified + reauth <= 10 menit, Google-only), `POST /auth/password-setup/confirm` (token sekali pakai terikat user, cabut sesi).
- Google OAuth (`openid-client` v6, Authorization Code + PKCE S256, state + nonce) di `GET /auth/google/start`, `GET /auth/google/callback`, `POST /auth/link/google` (verified + reauth), `DELETE /auth/link/google` (verified + reauth, password wajib). Transaksi OAuth disimpan di cookie terenkripsi AES-256-GCM + bertanda tangan HMAC, HttpOnly, path `/api/v1/auth/google`, sekali pakai. Token exchange memakai redirect URI terdaftar (`GOOGLE_REDIRECT_URI`), bukan Host header. Auto-link email dilarang: email yang sudah punya akun → redirect `/login?error=link_required`, tidak pernah menjadi registrasi/login baru.
- `/me` MeVerified kini mengembalikan `providers` nyata dan `has_password` dari data `AuthAccount`/`User`.
- Keamanan: session JWT HttpOnly/SameSite=Lax max 7 hari (jose), `session_version` dicek ke DB tiap akses protected (termasuk callback link), CSRF terikat sesi/pre-session, Argon2id, token disimpan sebagai hash, payload outbox disegel AES-256-GCM, error contract + `X-Request-Id`, rate limit login 10x/15 menit per IP+email dengan `Retry-After` 429.
- Repository di-abstrak (`AuthRepo`): adapter Prisma untuk produksi, in-memory untuk test; `createUserWithState` dan `consumePasswordSetupToken` atomik dalam transaksi.
- Kontrak sesuai API-SPEC: register/verify/resend/forgot memberi respons umum (anti-enumeration), reset mencabut semua sesi, verifikasi 24 jam, reset 30 menit.
- Worker email terpisah tersedia melalui `npm run dev:worker` atau `npm run start:worker`: klaim batch atomik memakai lease + `SKIP LOCKED`, console sink lokal atau SMTP, retry exponential, graceful shutdown, dan pembersihan payload token setelah sent/gagal permanen.

## Verifikasi (exit code 0)

- `npm test` lulus 31/31 (node:test, tanpa DB/Supabase), termasuk OAuth login/link, session revoked, template email, console sink, transisi sent/retry/failed, kecocokan template-purpose, dan batas backoff.
- `npm run typecheck` — bersih.
- `npm run build` — `dist/` ter-emit.
- `prisma generate` (URL placeholder lokal) dan `prisma migrate diff` — schema valid; output diff identik dengan `migration.sql` (periksa silang via `cmp`).
- `prisma migrate status` — database Supabase baru up to date (pooler sesi, port 5432).

## Belum selesai / tidak terverifikasi

- Project Supabase baru memakai pooler IPv4 karena host direct `db.<ref>.supabase.co:5432` hanya menyediakan IPv6 dan mesin ini tidak memiliki rute IPv6. Runtime memakai transaction pooler (`DATABASE_URL`, port 6543) dan migrasi memakai session pooler (`DIRECT_URL`, port 5432); keduanya diberi `sslmode=require&uselibpqcompat=true` agar Prisma adapter menerima rantai sertifikat pooler.
- Google OAuth sudah diverifikasi hingga halaman login Google dengan kredensial lokal pada 20 September 2026: authorization endpoint menerima client/redirect URI (tidak ada `redirect_uri_mismatch`). Callback final (code exchange + login pengguna nyata) belum dilakukan dalam browser. `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` mengaktifkan route; lokal tanpa `GOOGLE_REDIRECT_URI` otomatis memakai `http://127.0.0.1:<PORT>/api/v1/auth/google/callback`. Produksi wajib `GOOGLE_REDIRECT_URI` eksplisit dan harus didaftarkan di Google Cloud.
- Pengiriman SMTP nyata belum diverifikasi karena kredensial SMTP staging belum tersedia; unit test memakai sender/sink terisolasi.
- Rate limit baru login; limit email 3/jam per email & 20/jam per IP, business 120/menit per user, dan penyimpanan durable `rate_limit_bucket` belum diwire.
- Idempotency record (`IdempotencyRecord`) belum dipakai endpoint mana pun.
- Integration test terhadap PostgreSQL nyata belum ada; smoke test Google/link-intent terhadap Supabase nyata belum dijalankan.
- CI belum disetel; frontend masih memakai auth simulasi (di luar scope M0 backend).
