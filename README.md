# Tracker

Tracker adalah rancangan aplikasi web responsif untuk mengelola aktivitas pribadi, keuangan, dan proyek dalam satu akun.

Status per 22 September 2026: dokumentasi spesifikasi 0.4 tersedia. Frontend SPA (Vite + React) terhubung ke API Express untuk autentikasi serta modul M1, M2, dan M3. Migrasi M0 sampai M3 telah diterapkan ke database pengembangan Supabase; lihat [status backend](api/STATUS.md). M2 mencakup Habit, Timebox, dan Pomodoro dengan deadline server serta pemulihan setelah reload. M3 mencakup akun keuangan, kategori, transaksi/transfer, revision history, dan anggaran persisten. Modul M4 dan seterusnya belum diimplementasikan. Kebutuhan berasal dari percakapan perencanaan, bukan riset pengguna atau pengukuran penggunaan. Revisi 0.2 mengganti pencatat waktu bebas menjadi Pomodoro. Revisi 0.3 menetapkan Timebox, siklus Pomodoro harian, default UI Inggris, kemampuan turunan di modul sumber, dashboard tanpa rincian keuangan, serta logout semua perangkat. Revisi 0.4 menyelaraskan keputusan teknis ke implementasi nyata: frontend adalah SPA Vite + React (bukan Next.js), backend menjadi API Node terpisah (Express), dan database memakai Supabase (PostgreSQL terkelola); model auth custom tetap. Lihat [DECISIONS](DECISIONS.md) D-40..D-45.

## Dokumen

| Urutan | Dokumen | Kegunaan |
|---|---|---|
| 1 | [PRD](PRD.md) | Kebutuhan produk dan kriteria penerimaan |
| 2 | [Keputusan](DECISIONS.md) | Keputusan pengguna dan default teknis |
| 3 | [Alur UX](UX-FLOWS.md) | Halaman, interaksi, dan kondisi kegagalan |
| 4 | [ERD](ERD.md) | Entitas dan relasi dalam diagram Mermaid |
| 5 | [Skema](SCHEMA.md) | Field, constraint, dan aturan integritas |
| 6 | [Arsitektur](ARCHITECTURE.md) | Komponen, alur data, dan autentikasi |
| 7 | [API](API-SPEC.md) | Kontrak HTTP dan format data |
| 8 | [Rencana implementasi](PLAN.md) | Tahap pembangunan dan syarat selesai |
| 9 | [Rencana pengujian](TEST-PLAN.md) | Skenario dan bukti yang harus dikumpulkan |

## Cakupan versi pertama

- Aktivitas: Timebox di dashboard, tugas, kebiasaan, dan Pomodoro dengan siklus harian; pengulangan berada di dalam Tasks.
- Proyek: tugas bersama model aktivitas, Kanban, tenggat, progres, dan dependensi.
- Keuangan: akun IDR, transaksi manual, transfer, anggaran, draft transaksi berulang, dan laporan.
- Akun: Google serta email/kata sandi, verifikasi email, reset kata sandi, dan pengaturan profil.
- Kemampuan turunan: laporan per rentang tanggal dan CSV di modul sumber; pengulangan transaksi di Finance. Tidak ada modul mandiri pengulangan/laporan/CSV.
- Default UI: bahasa Inggris. Dashboard tidak menampilkan rincian keuangan. Logout semua perangkat mencakup perangkat aktif dan mengharuskan login kembali.

Setiap pengguna hanya mengakses datanya sendiri. Aplikasi membutuhkan koneksi ke server untuk menyimpan perubahan.

## Cara menggunakan spesifikasi

PRD menetapkan perilaku produk; SCHEMA merinci data; API-SPEC menetapkan kontrak akses; UX-FLOWS menerjemahkan perilaku ke alur pengguna. PLAN dan TEST-PLAN harus mengikuti keempatnya. Bila ada perbedaan, catat keputusan dalam DECISIONS dan perbarui dokumen terkait sebelum implementasi.

Contoh payload dan data pada dokumen serta carousel adalah data sintetis berlabel contoh.

## Menjalankan aplikasi lokal

Frontend adalah SPA Vite + React 19 + TypeScript. Proyek ini menggunakan Node.js 24 atau lebih baru. Jalankan dari folder proyek:

```bash
npm ci
npm run dev
```

Jalankan API di terminal kedua:

```bash
cd api
npm ci
npm run dev
```

Buka http://127.0.0.1:3000. Vite meneruskan permintaan `/api` ke Express di `http://127.0.0.1:4000`; target dapat diubah lewat `API_PROXY_TARGET`. Untuk build produksi jalankan `npm run build` (menghasilkan aset statis di `dist/`), lalu `npm run preview`. Pemeriksaan frontend tersedia melalui `npm test`, `npm run typecheck`, dan `npm run build`.

Backend menyediakan `npm test`, `npm run test:integration`, `npm run typecheck`, dan `npm run build`. Integration test PostgreSQL hanya berjalan bila `RUN_POSTGRES_INTEGRATION=1` dan database sudah dimigrasikan. Workflow `.github/workflows/ci.yml` menyiapkan PostgreSQL 17 dan menjalankan seluruh pemeriksaan tersebut pada push serta pull request.

## Cakupan UI

- `/`: landing page, carousel empat modul, FAQ, menu ponsel, serta tema terang/gelap.
- `/login`, `/register`: terhubung ke API Express dengan CSRF, cookie session, status loading/error, dan redirect login sukses ke `/dashboard`; tombol Google memakai endpoint OAuth backend.
- `/forgot-password`, `/verify-email`: UI akun tersedia, tetapi integrasi API frontend masih perlu diselesaikan.
- `/privacy`: keterangan data pratinjau, bukan kebijakan produksi.
- `/dashboard`: dashboard persisten dengan Timebox, tugas, kebiasaan, dan kontrol Pomodoro, tanpa rincian keuangan.
- `/tasks`: terhubung ke API M1; menyediakan create/edit, status/reopen, arsip, List/Kanban, filter status/proyek/tenggat/arsip, serta completion history dari snapshot `TaskEvent` immutable. Metadata recurrence tetap `null` sampai M4.
- `/habits`: habit persisten dengan jadwal berversi, check-in per tanggal, riwayat yang dapat dikoreksi, zona tetap, dan arsip terminal.
- `/pomodoro`: timer persisten 25/5/15 dengan pause/resume/cancel, siklus harian, deadline server, reload recovery, dan riwayat sesi.
- `/projects`: terhubung ke API M1; menyediakan create/edit, complete/archive/reopen, progres dari tugas tidak diarsipkan, serta Board/List yang membaca tugas persisten yang sama. Dependensi tugas baru masuk M4.
- `/finance/accounts`: akun IDR, kategori, transaksi manual, transfer, koreksi/void dengan revision history, saldo terhitung, serta anggaran bulanan persisten melalui API M3.
- `/settings`: UI profil dan pengaturan akun termasuk penautan Google dan logout semua perangkat; belum terhubung server.

Tahapan M0 sampai M6 dalam PLAN tetap merupakan rencana MVP, bukan klaim bahwa seluruh produk telah selesai. Arah visual dan referensi Mobbin yang diperiksa ada di [DESIGN](DESIGN.md).
