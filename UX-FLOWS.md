# Alur UX Tracker

Versi 0.3. Tanggal: 16 September 2026. Status: spesifikasi perilaku; bukan bukti pengujian UI. Referensi kebutuhan: [PRD](PRD.md).

## Struktur halaman

| Rute | Tujuan |
|---|---|
| `/login`, `/register`, `/verify-email`, `/forgot-password`, `/reset-password` | Autentikasi dan pemulihan |
| `/dashboard` | Today: Timebox, tugas, kebiasaan, dan kontrol Pomodoro; tanpa rincian keuangan |
| `/` | Landing page publik |
| `/tasks` | Tugas pribadi/proyek; filter status, proyek, tenggat, dan arsip |
| `/habits` | Kebiasaan, jadwal, check-in, dan riwayat |
| `/pomodoro` | Fokus/istirahat, countdown, pause/resume/cancel, fase berikutnya, dan riwayat |
| `/projects`, `/projects/:id` | Daftar proyek, detail, Kanban/daftar, progres, dependensi |
| `/finance/accounts` | Akun, saldo, saldo awal, dan catatan perubahan saldo awal |
| `/finance/categories` | Membuat, mengubah nama, dan mengarsipkan kategori |
| `/finance/transactions` | Pemasukan, pengeluaran, transfer, draft, dan void |
| `/finance/budgets` | Anggaran dan realisasi per bulan |
| `/settings` | Nama, zona waktu, metode login, dan logout perangkat |

Navigasi hanya menyediakan modul utama. Pengulangan dibuka dari Tasks atau Finance/Transactions; laporan dan CSV dibuka dari modul sumber, tanpa menu mandiri. Pada ponsel gunakan menu yang dapat dibuka/ditutup dengan keyboard. Identitas mengikuti [DESIGN](DESIGN.md); susunan dashboard merujuk Timebox pada wireframe.

## Dashboard dan Timebox (REQ-18)

Today menampilkan Timebox pada tanggal terpilih, tugas, kebiasaan, serta Pomodoro. Jangan menampilkan rincian Finance atau meminta data saldo, transaksi, anggaran, dan draft untuk mengisi dashboard.

Form “Add timebox” meminta kind, judul, start/end, dan tautan Task/Habit sesuai kind. Focus berdurasi rencana 25 menit. Tampilkan zona profil serta penanda “Schedule overlap” jika blok bertabrakan; benturan tidak menghalangi simpan. Daftar mencakup blok yang beririsan dengan tanggal terpilih, termasuk blok lintas tengah malam.

Detail menyediakan edit dan “Cancel timebox”; pembatalan mempertahankan catatan dan tidak membatalkan sesi Pomodoro aktual. Tautan sumber membuka aktivitas terkait. “Start focus” meminta start manual melalui Pomodoro dan mengikuti state/phase server; bila next_phase adalah break atau sesi lain terbuka, arahkan ke kontrol Pomodoro untuk menyelesaikan alur dahulu. Blok rencana tidak otomatis menandai aktivitas selesai.

## Bahasa dan teks UI

Seluruh label, validasi, status, dialog, dan pesan API yang ditampilkan memakai Inggris sebagai default. Penjelasan dokumen tetap Indonesia; contoh teks UI di bawah memakai Inggris. Tidak menambahkan pemilih bahasa sebagai fitur MVP.

## Autentikasi dan profil (REQ-01, REQ-17)

Registrasi email meminta nama, email, kata sandi, lalu mengirim tautan verifikasi. Sesi belum terverifikasi boleh mengakses verifikasi, kirim ulang, logout, dan profil minimal read-only; modul bisnis dan perubahan profil memerlukan email terverifikasi. Reset menerima email dengan pesan hasil yang sama untuk akun ada/tidak ada. Token expired/terpakai menampilkan tindakan meminta tautan baru.

Google dengan email terverifikasi dapat membuat akun. Jika email sudah digunakan oleh metode lain, arahkan pengguna masuk melalui metode lama dan menautkan Google dari Settings; jangan menggabungkan otomatis. Google-only dapat menambahkan kata sandi setelah verifikasi tautan email dari sesi aktif. Melepas Google hanya tersedia bila kata sandi sudah aktif.

Perubahan zona waktu menjelaskan bahwa pengelompokan timestamp laporan akan mengikuti zona baru, sementara tanggal transaksi, check-in, archived_on habit, zona kalender habit, snapshot proyek, dan zona aturan pengulangan tidak berubah. Aturan pengulangan menampilkan zona waktu yang dipakainya.

Settings menyediakan “Log out of all devices”. Tampilkan penjelasan “You will also be logged out on this device. Log in again to continue.” sebelum aksi. Setelah server berhasil, hapus cookie/cache akun dan arahkan ke login. Padanan Indonesia: “Keluar dari semua perangkat”; “Anda juga akan keluar dari perangkat ini. Anda harus login kembali untuk melanjutkan.” Semua perangkat, termasuk perangkat yang mengirim request, harus login kembali.

## Tugas, proyek, dan dependensi (REQ-03, REQ-06, REQ-07)

Buat tugas dengan judul, prioritas, tenggat opsional, dan proyek opsional. Kanban dan daftar membaca sumber yang sama. Drag-and-drop harus memiliki alternatif tombol/pilihan status. Tugas overdue memiliki teks “Overdue”, bukan warna saja.

Detail tugas menyediakan edit, selesai/buka kembali, arsip, Pomodoro, dan dependensi. Daftar dependensi menampilkan pendahulu serta alasan blokir. Aksi selesai yang terblokir menampilkan tugas pendahulu yang belum selesai. Saat konflik versi, tampilkan versi terbaru dan minta pengguna meninjau ulang input sebelum menyimpan.

Detail proyek menampilkan jumlah selesai/total dan progres. Proyek selesai/arsip memiliki tindakan buka kembali. Memindahkan tugas dengan relasi dependensi menampilkan instruksi menghapus dependensi terlebih dahulu. Mengarsipkan proyek meminta konfirmasi karena menyembunyikan proyek dari daftar aktif.

## Kebiasaan dan Pomodoro (REQ-04, REQ-05)

Buat kebiasaan dengan nama, tanggal mulai immutable, dan hari terjadwal. Tampilkan zona tetap habit yang disalin dari profil saat create; perubahan zona profil tidak mengubah kalender habit lama. Checklist menampilkan hari relevan. Pengguna dapat membatalkan/mencatat check-in hari lampau terjadwal sampai archived_on. Edit jadwal selalu berlaku besok pada zona habit dan mempertahankan riwayat; habit arsip menonaktifkan form nama/jadwal. Menyimpan jadwal menaikkan version Habit, bukan mengubah jadwal yang sudah berlaku.

Pomodoro memiliki halaman dan kontrol persisten: fase, tugas atau “No task”, sisa waktu, hitungan fokus selesai pada siklus hari ini, tanggal/zona siklus, pause/resume, dan cancel. Sebelum start, tampilkan next_phase dari server; focus boleh memilih tugas, break tidak. Setiap empat fokus completed dalam hari yang sama, tawarkan “Start long break”. Hari baru mulai count=0,next_phase=focus; fokus melintasi tengah malam tetap dihitung pada siklus tanggal mulai. Sesi lama tidak dibatalkan; ketika terminal, beralih ke siklus hari ini sebelum menawarkan start. Saat sesi lama masih terbuka, tampilkan tanggal siklus sesi dan hitungan hari ini terpisah. Setelah perubahan zona, siklus tanggal yang sudah ada digunakan kembali tanpa reset hitungannya. Setelah fase terminal, tampilkan tombol mulai fase berikutnya; jangan langsung menjalankannya.

Reload mengambil state, sesi, server_now, remaining_seconds, serta next_phase dari server. Selama pause, countdown tetap. Bila countdown lokal mencapai nol, tampilkan “Waiting for phase completion” sampai server merekonsiliasi deadline. UI polling state saat terbuka dan memakai server_now sebagai acuan; tidak menulis timestamp perangkat ke server.

Cancel meminta konfirmasi dan menjelaskan bahwa waktu fokus yang telah berjalan tetap tercatat, tetapi tidak menambah Pomodoro selesai. Melewati break dilakukan melalui start lalu cancel, sehingga pembatalan terlihat pada riwayat. Tidak ada pengaturan durasi pada MVP.

Saat fokus running/paused, aksi selesai/pindah/arsip tugas dan selesai/arsip proyek menampilkan alasan blokir serta tautan ke sesi. Edit judul/prioritas/tenggat tetap dapat dilakukan; label riwayat tetap memakai snapshot. Offline menonaktifkan mutasi, mempertahankan state terakhir berlabel, dan tidak menganggap pause/cancel sukses. Fase dapat mencapai deadline server saat perangkat offline; ambil ulang state setelah tersambung.

## Keuangan (REQ-08 sampai REQ-12)

Buat akun dengan nama, tipe, dan saldo awal. Buat kategori pemasukan/pengeluaran. Form transaksi meminta tipe, akun, nominal IDR, kategori sesuai tipe, tanggal, dan catatan opsional. Transfer mengganti kategori dengan akun tujuan dan menampilkan perubahan pada kedua akun sebelum konfirmasi.

Transaksi posted dapat dikoreksi atau dibatalkan dengan konfirmasi. Detail menampilkan riwayat revisi create/edit/post/void; koreksi menjelaskan bahwa laporan periode lama akan dihitung ulang. Tindakan pembatalan menjelaskan efek saldo dan mempertahankan riwayat. Draft menampilkan label “Not included in balance yet” dan aksi edit/konfirmasi/batalkan. Tombol kirim dikunci selama request, tetapi retry tetap memakai kunci idempotensi yang sama.

Anggaran meminta bulan, kategori pengeluaran, dan batas IDR. Tampilkan nominal realisasi dan sisa, termasuk teks “Over budget” ketika negatif. Akun/kategori arsip tetap terlihat pada transaksi lama dan tidak ditawarkan untuk transaksi baru.

## Kemampuan turunan di modul sumber (REQ-12 sampai REQ-14)

Tasks menyediakan pengaturan pengulangan tugas; Finance/Transactions menyediakan pengulangan transaksi dan draft occurrence. Riwayat aturan, versi, dan occurrence dibuka dari modul pemilik. Reports/Export CSV menjadi tab atau tindakan pada Tasks, Projects, Habits, Pomodoro, dan Finance; Finance juga menyediakan ekspor anggaran. Filter dan ekspor mempertahankan konteks modul/proyek yang sedang dibuka.

Aturan pengulangan meminta jenis, template, tanggal mulai, interval, frekuensi, akhir opsional, dan menampilkan zona waktu serta jadwal berikutnya. Form bulanan menjelaskan aturan akhir bulan. Edit menampilkan version konfigurasi dan tanggal mulai berlaku setelah cutoff. Riwayat versi/occurrence lama tetap tersedia; worker tidak mengubah version konfigurasi. Jika backlog >100, tampilkan “Previous occurrences are being processed. Try editing again when finished.” dan pertahankan input. Aturan proyek terblokir menampilkan aksi buka proyek atau hentikan tanpa membuat tanggal tertunda. Stopped/expired read-only dan memerlukan aturan baru bila ingin melanjutkan.

Laporan memakai tanggal awal/akhir inklusif dan menampilkan zona waktu. Rentang awal adalah bulan kalender berjalan. Tampilkan jumlah, definisi perhitungan, dan tautan menuju event/interval/revisi asal. Bedakan “Completion events” dari “Unique tasks”; jelaskan bahwa progres proyek memakai kondisi terkini. Waktu fokus mencakup sesi completed/cancelled, tanpa pause/break; tampilkan cancelled terpisah dari hitungan fokus selesai. Keuangan diberi penjelasan “Based on current corrected transactions”. Hari tanpa jadwal kebiasaan tidak dihitung sebagai kegagalan; rasio tanpa denominator ditampilkan “No scheduled days”. CSV menggunakan filter yang sama.

## Kondisi umum dan responsif (REQ-02, REQ-15, REQ-16)

| Kondisi | Perilaku |
|---|---|
| Kosong | Sebutkan data belum ada dan tindakan membuat catatan pertama; tidak tampilkan data contoh sebagai data nyata |
| Loading | Indikator berlabel; cegah submit ganda; pertahankan konteks halaman |
| Error validasi | Pesan dekat field, ringkasan yang mendapat fokus, input tidak hilang |
| Error server | Pesan gagal, retry, dan input dipertahankan; tidak ada toast sukses |
| Offline | Banner berteks, mutasi dinonaktifkan; data lama diberi label belum diperbarui |
| Sesi expired | Minta login ulang tanpa membuka data ke pengguna berikutnya; hapus cache data akun saat logout |
| Resource tidak ditemukan | Pesan umum tanpa membocorkan kepemilikan; tautan kembali ke daftar |
| Konflik edit | Ambil data terbaru, tampilkan konflik, jangan menimpa diam-diam |

Uji pada lebar 360, 768, dan 1440 px. Tidak boleh ada overflow halaman atau teks keluar dari komponen; tabel boleh memiliki area scroll horizontal berlabel yang dibatasi kontainer. Semua aksi memiliki label, target sentuh minimal 44 px, fokus terlihat, dan kontras WCAG AA. Status harus tersedia melalui teks, tidak hanya warna.

Dialog menjaga fokus, Escape menutup bila aman, dan mengembalikan fokus ke pemicu. Error/status penting menggunakan announcement aksesibel. Chart selalu disertai ringkasan angka atau tabel; jangan mengandalkan hover untuk informasi utama.
