# Tracker

Tracker adalah rancangan aplikasi web responsif untuk mengelola aktivitas pribadi, keuangan, dan proyek dalam satu akun.

Status per 20 September 2026: dokumentasi spesifikasi 0.4 tersedia, serta frontend SPA (Vite + React) dengan landing page, UI akun, dan halaman modul siap dihubungkan. Backend autentikasi, database, migrasi, dan modul bisnis **belum diimplementasikan**. Kebutuhan berasal dari percakapan perencanaan, bukan riset pengguna atau pengukuran penggunaan. Revisi 0.2 mengganti pencatat waktu bebas menjadi Pomodoro. Revisi 0.3 menetapkan Timebox, siklus Pomodoro harian, default UI Inggris, kemampuan turunan di modul sumber, dashboard tanpa rincian keuangan, serta logout semua perangkat. Revisi 0.4 menyelaraskan keputusan teknis ke implementasi nyata: frontend adalah SPA Vite + React (bukan Next.js), backend menjadi API Node terpisah (Express), dan database memakai Supabase (PostgreSQL terkelola); model auth custom tetap. Lihat [DECISIONS](DECISIONS.md) D-40..D-45.

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

## Menjalankan landing page

Frontend adalah SPA Vite + React 19 + TypeScript. Proyek ini menggunakan Node.js 24 atau lebih baru. Jalankan dari folder proyek:

```bash
npm ci
npm run dev
```

Buka http://127.0.0.1:3000. Untuk build produksi jalankan `npm run build` (menghasilkan aset statis di `dist/`), lalu `npm run preview` untuk melayaninya secara lokal di port 3000. Pemeriksaan tipe: `npm run typecheck`. Skrip yang tersedia saat ini: `dev`, `build`, `preview`, `typecheck` (lihat [package.json](package.json)); suite tes otomatis (unit/integration/E2E) baru dijadwalkan pada tahap backend di [PLAN](PLAN.md) dan belum dikonfigurasi.

## Cakupan UI

- `/`: landing page, carousel empat modul, FAQ, menu ponsel, serta tema terang/gelap.
- `/login`, `/register`, `/forgot-password`, `/verify-email`: UI akun dengan validasi dan status permintaan; kirim ulang verifikasi dan reset kata sandi ditangani di dalam halaman terkait (belum sebagai rute tersendiri).
- `/privacy`: keterangan data pratinjau, bukan kebijakan produksi.
- `/dashboard`: kerangka dashboard dengan widget contoh (Timebox, tugas, kebiasaan, Pomodoro), tanpa rincian keuangan; data di memori tab, belum terhubung server.
- `/tasks`: List/Kanban/History atas satu data client-side yang sama, filter status/proyek/tenggat/arsip, dependensi antar-tugas, dan riwayat penyelesaian; data contoh tersimpan di memori tab, belum terhubung server (lihat PLAN.md, M1).
- `/habits`: kartu habit dengan jadwal hari-dalam-minggu, check-in per tanggal, rasio mingguan, kalender riwayat yang dapat dikoreksi, edit jadwal, dan arsip; zona habit tetap; data contoh di memori tab, belum terhubung server (lihat PLAN.md, M2).
- `/pomodoro`: timer fokus/istirahat dengan durasi tetap 25/5/15, satu sesi berjalan, pause/resume/cancel, siklus harian (fokus keempat → long break), hitungan fokus, dan riwayat sesi; deadline disimulasikan di tab, belum terhubung server (lihat PLAN.md, M2).
- `/projects`: daftar proyek, papan Kanban, tenggat, progres, dan dependensi antar-tugas; data contoh di memori tab, belum terhubung server (lihat PLAN.md, M1).
- `/finance/accounts`: akun IDR, transaksi manual, transfer, dan saldo; data contoh di memori tab, belum terhubung server (lihat PLAN.md, M3).
- `/settings`: UI profil dan pengaturan akun termasuk penautan Google dan logout semua perangkat; belum terhubung server.

Pengguna memilih frontend SPA (landing, UI akun, dan halaman modul) siap dihubungkan, tanpa pembangunan backend akun. Tahapan M0 sampai M6 dalam PLAN tetap merupakan rencana MVP, bukan klaim telah selesai. Arah visual dan referensi Mobbin yang diperiksa ada di [DESIGN](DESIGN.md).
