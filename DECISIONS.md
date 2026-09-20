# Keputusan Tracker

Versi 0.4. Tanggal: 20 September 2026. Status: rancangan; frontend SPA telah dibangun, backend/database belum diimplementasikan. Revisi 0.4 menyelaraskan keputusan teknis ke implementasi nyata: frontend adalah SPA Vite + React (bukan Next.js), backend menjadi API Node terpisah, dan database memakai Supabase (PostgreSQL terkelola). Lihat bagian "Revisi 0.4"; baris yang digantikan ditandai.

## Pilihan pengguna

| ID | Keputusan |
|---|---|
| D-01 | Satu produk untuk aktivitas pribadi, keuangan, dan proyek |
| D-02 | Web responsif untuk browser desktop dan ponsel |
| D-03 | Pengguna pribadi dengan akun; tanpa kolaborasi tim |
| D-04 | Fitur utama mencakup aktivitas, proyek, dan keuangan; pengulangan/laporan/CSV adalah kemampuan turunan di modul sumber; dependensi tugas tetap tersedia |
| D-05 | Penyimpanan utama di server; online terlebih dahulu |
| D-06 | IDR dengan beberapa akun, pencatatan manual, dan transfer |
| D-07 | Google serta email/kata sandi |
| D-08 | Paket dokumentasi MVP siap implementasi; teknologi dipilih berdasarkan kebutuhan |

## Default implementasi

Default berikut melengkapi rencana yang diterima. Ini keputusan rancangan, bukan temuan dari kode yang sudah berjalan.

| ID | Default dan alasan |
|---|---|
| D-09 | *(Digantikan D-40/D-41/D-42.)* Rancangan awal: Next.js App Router menggabungkan web dan API dalam satu deployment; PostgreSQL/Prisma/Zod. Yang tetap berlaku: PostgreSQL untuk data relasional, Prisma untuk akses data/migrasi, Zod untuk validasi |
| D-10 | *(Digantikan D-43.)* Rancangan awal: Auth.js untuk Google dan Credentials. Yang tetap berlaku: sesi JWT dengan pemeriksaan versi sesi terhadap User agar reset/logout semua perangkat dapat mencabut akses |
| D-11 | Registrasi, verifikasi, reset, hash Argon2id, rate limit, dan penautan identitas merupakan logika aplikasi; email dikirim melalui SMTP dengan Nodemailer. *(Implementasi framework diperjelas di D-43: logika ini berada di API Node, bukan Auth.js/Supabase Auth.)* |
| D-12 | Bahasa Inggris untuk UI; dokumentasi Indonesia, IDR bulat, zona waktu awal Asia/Jakarta, minggu Senin; timestamp disimpan UTC; tanggal bisnis memakai DATE |
| D-13 | UUID untuk entitas; uang menggunakan BIGINT dan dikirim sebagai string digit di JSON untuk menghindari kehilangan presisi |
| D-14 | Tugas pribadi/proyek satu tabel; TaskEvent immutable dan snapshot untuk laporan; habit memiliki versi jadwal dan archived_on tetap |
| D-15 | Satu transaksi transfer memuat akun sumber/tujuan; saldo dihitung dari transaksi posted, bukan field saldo yang ditulis terpisah |
| D-16 | Pengulangan harian/mingguan/bulanan dengan interval positif; tanggal bulanan dijepit ke akhir bulan; job mengejar jadwal tertinggal secara bertahap |
| D-17 | Generasi tugas langsung menghasilkan tugas; generasi keuangan menghasilkan draft; unique occurrence menjamin tidak berulang saat retry |
| D-18 | Semua list memakai page/page_size dan urutan stabil; mutasi memakai version; version aturan khusus konfigurasi, cursor worker terpisah; penciptaan memakai Idempotency-Key |
| D-19 | *(Diperjelas D-41/D-42.)* SPA statis, API Node, dan worker Node.js berjalan sebagai unit terpisah; PostgreSQL memakai Supabase terkelola; worker memeriksa deadline Pomodoro setiap detik, pengulangan setiap menit, dan outbox email; tidak perlu Redis untuk MVP |
| D-20 | Identitas visual mengikuti DESIGN; wireframe menjadi referensi struktur fitur, dengan keputusan 0.3 sebagai acuan perilaku terbaru |
| D-21 | Saldo negatif diizinkan; transaksi posted masa depan ditolak; draft berulang dapat disimpan lebih lama tanpa otomatis posted |
| D-22 | Laporan maksimal 366 hari per request; ekspor CSV sinkron dengan batas yang sama dan status error bila terlalu besar |
| D-23 | Mutasi satu pengguna diserialisasi dengan lock User sebelum lock resource/aturan, termasuk worker, untuk menyederhanakan integritas MVP |
| D-24 | Menghapus anggaran menghapus rencana saja; transaksi tetap tersimpan. Dependensi/check-in dapat dihapus; event, interval final, dan revisi tetap immutable |
| D-25 | Perubahan pengguna: pencatat waktu bebas diganti Pomodoro. Default rancangan MVP: fokus 25 menit, break 5 menit, long break 15 menit setiap empat fokus completed dalam siklus harian; durasi tetap dan fase berikutnya manual |
| D-26 | Pomodoro mendukung pause/resume/cancel; satu sesi running/paused; deadline server membatasi durasi; completed/cancelled focus masuk waktu laporan, break/pause tidak |
| D-27 | Task.completed_at adalah keadaan terkini; laporan memakai kejadian selesai dan jumlah tugas unik dari TaskEvent, bukan field tersebut |
| D-28 | Snapshot tugas/proyek pada event dan fokus tidak berubah saat rename/pindah; archived_on habit tidak dihitung ulang saat zona berubah |
| D-29 | Transaksi terkoreksi membentuk laporan keuangan terkini; revisi transaksi dan perubahan saldo awal immutable menjelaskan perubahan periode lama; bukan laporan beku |
| D-30 | Tanggal mulai dan zona habit immutable sejak create; zona snapshot profil mengatur check-in/jadwal/archived_on; habit arsip read-only kecuali koreksi check-in historis; sesi belum terverifikasi boleh membaca profil minimal |
| D-31 | M1 membuat Task tanpa FK aturan; M4 menambah FK/occurrence/rule_version dan revisi. Tidak ada migrasi yang merujuk tabel tahap berikutnya |
| D-32 | Project list memakai status saja (default active); Rule list status active/stopped/expired/all; resource arsip lainnya memakai archived; kombinasi filter bertentangan ditolak |
| D-33 | *(Diperjelas D-43.)* Penautan Google memakai callback OAuth standar dengan AuthLinkIntent server sekali pakai, sid sesi dan reautentikasi; intent tidak menggantikan state/PKCE/nonce OAuth |

## Revisi pengguna — 16 September 2026

| ID | Keputusan dan dampak |
|---|---|
| D-34 | Timebox pada dashboard diterima sebagai REQ-18; menyimpan rencana Class/Task/Habit/Focus, terpisah dari realisasi aktivitas. SCHEMA/ERD/API/M2/T-18 mengikuti model ini |
| D-35 | Pomodoro memakai siklus harian; tanggal/zona siklus tersimpan, sesi lintas tengah malam dihitung pada tanggal mulai dan tetap berjalan. Setelah terminal/idle beralih ke hari saat ini; tanggal yang pernah dipakai menggunakan siklus tersimpan. Menggantikan aturan lintas hari 0.2 |
| D-36 | UI default Inggris; penjelasan dokumentasi Indonesia; IDR/Jakarta/Senin tetap. Tidak menambahkan pemilih bahasa |
| D-37 | REQ-12 tetap sebagai pengulangan di Tasks dan Finance; REQ-13/14 menjadi laporan/CSV pada modul sumber. Tidak ada halaman/menu independen. Model histori dan worker tetap dipakai |
| D-38 | Dashboard hanya Timebox, tugas, kebiasaan, Pomodoro; rincian keuangan termasuk draft berada di Finance |
| D-39 | Label “Log out of all devices”, padanan Indonesia “Keluar dari semua perangkat”; penjelasan wajib menyatakan perangkat aktif ikut keluar dan pengguna harus login kembali |

Default detail Timebox dan batas hari D-34/D-35 melengkapi keputusan pengguna untuk implementasi, bukan hasil pengujian kode. Dokumen terdampak: README, PRD, UX-FLOWS, SCHEMA, ERD, API-SPEC, ARCHITECTURE, PLAN, TEST-PLAN, DECISIONS, serta catatan bahasa/cakupan DESIGN.

## Revisi 0.4 — 20 September 2026 (penyelarasan ke implementasi)

Frontend sudah dibangun sebagai SPA sebelum backend, sehingga pilihan framework di D-09/D-10/D-11/D-19/D-33 tidak lagi cocok. Keputusan berikut menyelaraskan dokumen ke realita dan menggantikan bagian yang ditandai di atas. REQ dan model data (SCHEMA/ERD/PRD) tidak berubah; yang berubah hanya framework, topologi deployment, dan penyedia database.

| ID | Keputusan dan alasan |
|---|---|
| D-40 | Frontend adalah SPA Vite + React 19 + TypeScript dengan react-router-dom (client-side routing), disajikan sebagai aset statis; bukan Next.js App Router. Alasan: inilah yang telah dibangun (landing page, UI akun, dan halaman modul). Menggantikan bagian "Next.js" pada D-09 |
| D-41 | Backend adalah service Node.js terpisah (Express + TypeScript) yang menyediakan REST `/api/v1`. Web (SPA), API, dan worker adalah unit deployment terpisah, bukan satu aplikasi fullstack. Prisma/Zod tetap dipakai di API. Melengkapi D-09/D-19 |
| D-42 | Database memakai Supabase sebagai PostgreSQL terkelola. Akses data dan migrasi tetap melalui Prisma terhadap connection string Postgres Supabase. Supabase Storage dan Edge Functions tersedia sebagai opsi platform, tetapi tidak dipakai untuk inti MVP. Row Level Security opsional sebagai defense-in-depth; otorisasi pemilik tetap ditegakkan di service aplikasi (bukan hanya RLS). Menggantikan penyedia PostgreSQL pada D-09/D-19 |
| D-43 | Model auth custom dipertahankan dan diimplementasikan di API Node — bukan Auth.js dan bukan Supabase Auth. Tetap: Argon2id, verifikasi email 24 jam, reset 30 menit, session_version untuk reset/logout semua perangkat, rate limit, outbox SMTP, dan penautan identitas. Google OAuth memakai library OAuth/OIDC standar (mis. openid-client atau Passport) dengan proteksi state/PKCE/nonce; AuthLinkIntent D-33 tetap berlaku pada callback custom. Menggantikan D-10 dan bagian Auth.js pada D-11/D-33 |
| D-44 | SPA dan API disajikan pada origin yang sama melalui reverse proxy, sehingga cookie sesi HttpOnly/SameSite=Lax dan proteksi CSRF terikat sesi dari rancangan tetap berlaku dan CORS lintas origin tetap dinonaktifkan. Alternatif origin terpisah memerlukan allowlist CORS eksplisit, cookie kredensial, dan SameSite=None; dipilih hanya bila reverse proxy tidak memungkinkan |
| D-45 | Google OAuth kini rute custom di API (`/api/v1/auth/google/*`) menggantikan `/api/auth/*` bawaan Auth.js; kontrak endpoint, DTO, dan proteksi lain di API-SPEC tidak berubah selain penyedia flow ini |

Dokumen terdampak revisi 0.4: README, ARCHITECTURE, dan PLAN diperbarui; API-SPEC diperbarui pada dua rujukan Auth.js; ERD diperbarui pada satu kalimat penyedia sesi. Model data (tabel, relasi, constraint) di ERD/SCHEMA dan perilaku di PRD/UX-FLOWS/TEST-PLAN tidak berubah karena revisi ini hanya menyangkut framework dan topologi deployment.

## Hal yang ditunda

Kolaborasi, bank API, multi-mata uang, lampiran, push, offline sync, pengaturan/koreksi durasi Pomodoro, biaya proyek, dan ekspor backup lengkap ditunda. Vendor hosting, domain, SMTP, identitas Google OAuth, dan versi paket yang kompatibel ditetapkan pada tahap fondasi; rahasia tidak ditulis ke repositori.

Tidak ada tanggal rilis atau estimasi tenaga yang telah disepakati. PLAN memakai urutan dependensi dan syarat selesai.

## Mengubah keputusan

Catat tanggal, alasan, ID kebutuhan terdampak, serta dokumen yang diperbarui. Perubahan perilaku memerlukan pembaruan PRD, SCHEMA/API bila terkait, UX, dan kasus uji. Dokumen tidak boleh mengklaim implementasi telah lulus hanya karena spesifikasi selesai.
