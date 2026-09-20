# Rencana Pengujian Tracker

Versi 0.3. Tanggal: 16 September 2026. Status pengujian aplikasi: **belum dijalankan**. Kasus runtime berikut adalah acceptance plan; pemeriksaan dokumen tidak membuktikan kelulusan aplikasi.

## Lingkungan dan strategi

Vitest untuk kalender/state/agregasi; PostgreSQL terisolasi untuk FK/CHECK/partial unique/lock/transaksi/migrasi; Playwright untuk browser. Freeze clock dan gunakan presisi milidetik server. OAuth stub dan SMTP sink di CI; Google/SMTP nyata diuji terpisah di staging dengan akun uji yang diizinkan.

Fixture sintetis: dua pengguna,akun keuangan,proyek aktif/selesai/arsip,tugas berulang/manual,TaskEvent,jadwal habit berversi,Pomodoro running/paused/terminal,revisi transaksi,dan dua worker. Tidak memakai data produksi. Reset DB hanya di environment uji yang teridentifikasi.

## Matriks kebutuhan

| Uji | REQ | Kasus minimum | Lapisan |
|---|---|---|---|
| T-01 | REQ-01 | Register/verify/reset/token sekali pakai; akun unverified hanya profil minimal/logout/verify; Google email bentrok tidak auto-link; intent bound sid/reauth/expiry, callback invalid tidak fallback; metode terakhir tidak dilepas; reset/logout-all mencabut JWT termasuk sesi pemanggil; label/helper Inggris menjelaskan wajib login kembali; cookie/cache dibersihkan; CSRF/rate limit | Integrasi,E2E,staging |
| T-02 | REQ-02 | User B tidak membaca/mengubah ID A termasuk event/revision/Pomodoro/occurrence/CSV; FK komposit menolak beda pemilik; response tidak mengandung user_id/hash/token; cache cleared logout | Integrasi,E2E |
| T-03 | REQ-03 | CRUD/filter/status/reopen/arsip; event satu per mutasi nyata, no-op tanpa event; due null/overdue; version stale 409; personal+project_id dan overdue+done ditolak; pindah dengan edge keluar/masuk ditolak | Integrasi,E2E |
| T-04 | REQ-04 | start_date/timezone immutable; kalender habit tidak berubah saat profil ganti zona; check-in set idempotent; invalid/future/setelah archived_on ditolak; schedule edit besok menaikkan Habit version tanpa ubah jadwal lama; archived habit tidak edit/schedule; timezone berubah tidak mengubah archived_on | Unit,integrasi,E2E |
| T-05 | REQ-05 | 25/5/15; empat completed focus per hari mengarah long_break; hari baru focus/0; reuse Day saat zona kembali; rollover versi; lintas tengah malam tetap Day start; cancelled focus tidak menambah count; break complete/cancel kembali focus; start phase manual; satu running/paused; pause/resume interval; reload/offline; deadline finalize sekali; task/project transisi blokir; tidak ada stop/manual complete API | Unit,integrasi,E2E |
| T-06 | REQ-06 | Kanban/daftar konsisten; progres terkini vs history; kosong 0%; complete dengan tugas belum done ditolak; proyek nonaktif membuat Task read-only; project archive tidak archive Task; fokus running/paused menghalangi complete/archive | Unit,integrasi,E2E |
| T-07 | REQ-07 | Self/cross-project/cross-user/cycle ditolak; graf concurrent tidak cycle; successor done tidak menerima predecessor belum done; reopen predecessor dengan successor done ditolak; archive predecessor done tetap memenuhi edge | Unit,integrasi |
| T-08 | REQ-08 | Opening balance create/change log atomik; saldo negatif/BIGINT tepat; correction tidak masuk income; akun archive dengan rule aktif ditolak; history immutable | Unit,integrasi |
| T-09 | REQ-09 | Income/expense kategori type; amount 0/desimal/negatif/out-of-BIGINT ditolak; posted future ditolak; draft tanpa efek; setiap edit/post/void revision unik; void terminal; rollback revision/domain bersama | Unit,integrasi,E2E |
| T-10 | REQ-10 | Dua akun berbeda satu pemilik; fault sebelum commit tidak mengubah saldo/revision; key replay tidak menggandakan; transfer tidak masuk income/expense; list account_id hanya satu baris | Integrasi |
| T-11 | REQ-11 | Unique expense kategori/bulan; month hari pertama; posted expense saja mengisi; correction/void update; full_calendar_month basis dinyatakan; delete budget tidak menghapus transaksi | Unit,integrasi,E2E |
| T-12 | REQ-12 | Akses turunan Tasks/Finance tanpa menu mandiri; API namespace modul; daily/weekly/monthly/interval/end/leap; catch-up downtime; status active/stopped/expired; cursor worker version tetap; rule_revision/effective_after/occurrence rule_version; >100 edit tanpa perubahan; blocked project stop tanpa catch-up; stopped/expired read-only | Unit,integrasi |
| T-13 | REQ-13 | Summary hanya konteks modul/proyek snapshot; tanpa menu laporan mandiri; hitungan Day berbeda dari ended_at; event done tetap setelah reopen/pindah/rename; counts event vs distinct; snapshot proyek; focus interval overlap tanpa pause/break/open; cancelled waktu tanpa completed count; habits jadwal/arsip/date stabil; finance current revision dan basis jelas; ms sebelum rounding | Unit,integrasi,E2E |
| T-14 | REQ-14 | Ekspor dari modul sumber, section dibatasi konteks; tanpa menu CSV mandiri; CSV event/interval sesuai range/summary; ms total cocok; habit denominator dapat direkonsiliasi; revision version finance; escaping/Unicode/formula; 10000 limit sebelum streaming; no-store/attachment | Unit,integrasi |
| T-15 | REQ-15 | 360/768/1440 px; descendant overflow; keyboard/dialog/focus return; AA/status teks; touch target; chart tabel; Kanban alternatif drag; Pomodoro countdown/status aksesibel tanpa announcement tiap detik | E2E,QA manual |
| T-16 | REQ-16 | Empty/loading/error/offline/expired; sukses sesudah commit; timeout creation key sama; replay stale state refresh; payload conflict; version setelah deadline berubah refresh; input tetap; tidak auto-start next phase/reconcile offline | Integrasi,E2E |
| T-17 | REQ-17 | Nama/IANA valid; default Inggris/IDR/Jakarta/Senin; zone change memengaruhi timestamp grouping dan pemilihan Day saat idle, tanpa mengubah DATE/snapshot/zona aturan/habit/Day lama; profil unverified minimal read-only | Unit,integrasi,E2E |
| T-18 | REQ-18 | Class/Task/Habit/Focus; UTC dan list irisan hari; focus rencana 25 menit; overlap informatif; referensi satu pemilik/aktif saat ditaut; cancelled terminal/no-op/version; rencana tidak mengubah realisasi; dashboard tanpa rincian Finance | Unit,integrasi,E2E |

## Fixture dengan ekspektasi independen

Semua angka/tanggal berikut sintetis, bukan data pengguna.

### Pomodoro dan waktu

Fokus mulai 15 September 2026 23:50 Asia/Jakarta dan mencapai deadline 16 September 00:15 menghasilkan 1500 detik: 600 pada tanggal 15 dan 900 pada tanggal 16. Worker yang baru berjalan 00:20 tetap menyimpan ended_at=00:15, bukan 00:20. Day sesi adalah 15 September: completed_focus_count tanggal 15 bertambah satu, tanggal 16 tetap nol. Laporan completed tanggal 16 bertambah satu karena ended_at; setelah finalisasi State beralih ke Day tanggal 16 dengan focus/0.

Fokus mulai 10:00, pause 10:10, resume 10:20, completed 10:35: interval [10:00,10:10] dan [10:20,10:35], total 1500 detik. Durasi kalender 35 menit tidak boleh dilaporkan sebagai 35 menit fokus. Selama pause, remaining_seconds=900. Pembatalan pada 10:07 menghasilkan 420 detik dan completed_focus_count tetap 0.

Mulai dari State count=0,next_phase=focus. Fokus completed pertama/dua/tiga menyiapkan short_break; fokus keempat menyiapkan long_break. Short/long break selesai atau cancelled menyiapkan focus tanpa mengubah count. Tidak ada sesi next phase sebelum POST start. Reload/logout tidak mereset count pada hari yang sama. Saat idle lewat tengah malam, Day baru focus/0; break tertunda hari lama tidak ditawarkan. Fokus kedelapan hari yang sama kembali menyiapkan long_break. Sesi paused melewati tengah malam tetap terbuka pada Day asal sampai terminal. Pergantian zona tidak mengubah Day sesi; saat idle kembali ke tanggal yang sudah ada memakai Day/count lama, tanpa reset atau duplikasi.

Freeze clock sesudah due_at, kirim GET state dan worker finalisasi bersamaan: hanya satu completed/count increment. Pause dengan version lama setelah rekonsiliasi memberikan VERSION_CONFLICT. Completed session tidak dapat cancelled walau client meminta stop lama. Sesi paused memblokir start baru dan tidak expire otomatis.

### Timebox dan dashboard

Class 07:00..09:00 dan Task 08:30..09:30 pada zona Jakarta dapat disimpan bersama; UI menandai overlap. Blok 23:45..00:15 muncul pada kedua tanggal berdasarkan irisan UTC. Focus rencana 09:30..09:55 tidak memulai sesi saat jam 09:30; sesi baru ada sesudah aksi manual melalui Pomodoro. Pause pada sesi aktual tidak memanjangkan timestamp rencana.

Cancel/edit blok tidak membuat TaskEvent, check-in, atau interval baru. Referensi pengguna lain ditolak; tautan lama ke Task yang kemudian done tetap dapat dibaca/dibatalkan. Dashboard tidak memuat saldo, anggaran, transaksi, atau draft keuangan, termasuk pada empty/loading/error state.

### Sejarah tugas dan label proyek

Tugas X dibuat pada proyek P1, selesai, dibuka kembali, pindah ke P2 tanpa dependensi/fokus aktif, lalu selesai lagi. Laporan seluruh rentang: completed_count=2,distinct_task_count=1,P1 completed=1,P2 completed=1. Project progress membaca posisi/status X sekarang di P2. Membuka kembali X lagi mengosongkan Task.completed_at tetapi kedua event selesai tetap ada.

Rename proyek/tugas sesudah event tidak mengubah snapshot sumber. Per-project summary memakai ID snapshot dan label snapshot terakhir dalam rentang; jumlah distinct per proyek tidak harus sama dengan distinct global karena satu tugas dapat selesai di dua proyek.

Task PATCH/status/archive no-op tidak menambah event. Exception sebelum commit tidak meninggalkan Task tanpa event atau event tanpa perubahan. Saat fokus running/paused terkait X, done/pindah/archive X dan complete/archive proyek ditolak; edit judul tetap boleh tanpa mengubah label sesi.

### Saldo, transaksi, dan revisi

A awal Rp1.000.000,B Rp200.000. Income A Rp500.000,expense makan A Rp100.000,transfer A ke B Rp250.000: A Rp1.150.000,B Rp450.000,income Rp500.000,expense Rp100.000,net Rp400.000. Anggaran makan Rp300.000: spent Rp100.000,remaining Rp200.000.

Koreksi expense Rp150.000: A Rp1.100.000,spent Rp150.000; revision edited tetap menyimpan nilai Rp150.000 dan revisi awal Rp100.000 masih ada. Void expense: A Rp1.250.000,spent 0; history void dan revision sebelumnya tetap. Draft expense Rp50.000 tidak mengubah saldo.

Koreksi opening balance A +Rp100.000 menaikkan saldo A Rp100.000 dengan BalanceChange, income/net laporan tidak berubah. Fault transfer sebelum commit meninggalkan saldo/transaksi/revision sama seperti sebelum request. JSON nominal 9007199254740993 tetap tepat sebagai string.

### Kalender, versi konfigurasi, dan habit

Monthly mulai 31 Januari 2028 menghasilkan 31 Jan,29 Feb,31 Mar,30 Apr; tahun 2027 menghasilkan 28 Feb. end_date inklusif. Rule v1 menghasilkan Jan/Feb; worker tidak mengubah version. Edit setelah catch-up membuat v2,effective_after=cutoff; occurrence lama rule_version=1 dan berikutnya 2. >100 backlog edit gagal tanpa perubahan; worker catch-up tidak membuat version usang. Stop/expiry tidak membuat ulang occurrence void/arsip.

Habit zona Jakarta Senin/Rabu/Jumat pada 14..20 September 2026 (clock >=20 September) denominator 3; dua check-in ratio 2/3. Jadwal berubah 21 September tidak mengubah minggu lama. Arsip 20 September 00:30 Jakarta menyimpan archived_on=20 September; setelah zona diganti America/Los_Angeles dan clock maju cukup jauh, cutoff tetap tanggal 20 walau tampilan archived_at di sana tanggal 19. Jadwal/check-in tetap memakai kalender Jakarta, bukan tanggal Los Angeles baru; jadwal yang pernah berlaku tidak menjadi editable kembali. Denominator nol ratio null.

### Konkurensi, migrasi, dan CSV

Dua start Pomodoro dengan key berbeda dari dua koneksi: satu sesi open, lainnya POMODORO_ALREADY_ACTIVE. Dua edge yang bersama membentuk cycle: maksimal satu commit. Crash worker sesudah occurrence commit lalu retry: satu occurrence/revision/event per tanggal. Request create timeout setelah commit lalu replay key sama: ID/status/body sama dan jumlah baris satu; UI refresh state jika body replay sudah lama.

Terapkan 0001..0005 pada DB kosong serta 0005 pada fixture DB M3 populated. Task/Transaction lama tetap recurrence metadata null; revisi JSON lama tidak ditulis ulang; new recurrence FK mengarah tabel/revisi yang sudah dibuat. M0 membuat Day sebelum State; M2 membuat Timebox setelah Habit dan Session setelah Day. Dua GET/start saat rollover tidak membuat dua Day pada tanggal sama; State cache dan Day konsisten sesudah worker/request bersamaan. Verifikasi runtime role tidak bisa UPDATE/DELETE event/revision atau mengubah interval yang sudah ditutup.

CSV tasks menjumlah event done, DISTINCT task_id untuk unique. CSV pomodoro menjumlah overlap_ms kemudian floor sekali sesuai summary. Range budget parsial tetap label basis bulan penuh. CSV habits baris scheduled dan checked cocok dengan denominator. Teks formula/quote/newline aman dan uang tidak kehilangan presisi.

## Pemeriksaan dokumentasi

Revisi 0.3 memeriksa 10 dokumen kontrak dan catatan cakupan DESIGN, tautan lokal, contoh JSON, struktur Markdown/Mermaid, 18 pasangan REQ/T, serta keselarasan Timebox, siklus harian, namespace modul, bahasa default, logout semua perangkat, dan dashboard tanpa rincian keuangan.

Pemeriksaan revisi 0.3 pada 16 September 2026 menghasilkan 0 error: 11 file Markdown, 23 tautan lokal valid, 3 contoh JSON berhasil diparse, tabel/fence Markdown konsisten, 7 blok Mermaid dengan deklarasi/relasi dan penutup blok diperiksa, 29 entitas SCHEMA tercakup di ERD, dan 18 pasangan REQ/T. Pemeriksaan teks juga mencakup key siklus harian, urutan migrasi Day/State/Timebox, namespace pengulangan/laporan/CSV modul, serta label/helper logout. Rendering Mermaid, migrasi SQL, OAuth, browser, dan suite runtime tidak termasuk pemeriksaan ini.

## Bukti sebelum rilis aplikasi

Catat commit,tanggal,environment,command/exit code,hasil unit/integration/E2E,log build selesai,screenshot QA tiga lebar,keyboard/kontras,Google/SMTP staging,serta restore backup. Proses yang masih berjalan/bukti belum tersedia tidak boleh dianggap lulus. Dokumentasi lengkap bukan bukti aplikasi selesai.
