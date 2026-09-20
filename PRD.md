# PRD Tracker

Versi spesifikasi: 0.3. Tanggal: 16 September 2026. Status: revisi kebutuhan berdasarkan keputusan pengguna dan wireframe; implementasi modul bisnis belum diverifikasi.

## Masalah dan tujuan

Pengguna ingin mencatat tugas, kebiasaan, waktu aktivitas, keuangan, dan progres proyek dari satu aplikasi. Ini adalah rumusan kebutuhan dari brief pengguna; belum ada bukti riset tentang besarnya masalah atau dampak produk.

Tujuan versi pertama adalah menyediakan catatan yang tersimpan, laporan yang dapat ditelusuri ke catatan asal, dan pengalaman yang dapat digunakan dari browser desktop maupun ponsel. Keberhasilan penerimaan ditentukan oleh skenario berikut, bukan target pertumbuhan atau klaim performa yang belum diukur.

Pengguna sasaran adalah individu. Tidak ada workspace tim, peran administrator produk, atau berbagi proyek pada versi pertama.

## Kebutuhan dan penerimaan

| ID | Kebutuhan | Kriteria penerimaan | Uji |
|---|---|---|---|
| REQ-01 | Akun pribadi | Google dan email/kata sandi dapat masuk ke satu identitas setelah penautan eksplisit; email harus terverifikasi sebelum mengakses data bisnis; reset dan logout tersedia | T-01 |
| REQ-02 | Isolasi data | Seluruh baca/tulis, relasi, laporan, dan ekspor hanya menggunakan data pengguna aktif; ID milik pengguna lain tidak dapat diakses | T-02 |
| REQ-03 | Tugas | Pengguna membuat, mengubah, memfilter, menyelesaikan, membuka kembali, dan mengarsipkan tugas; proyek opsional; prioritas dan tenggat tersedia | T-03 |
| REQ-04 | Kebiasaan | Jadwal hari dalam minggu, satu check-in per tanggal lokal, pembatalan check-in, dan riwayat tersedia | T-04 |
| REQ-05 | Pomodoro | Fokus 25 menit, istirahat pendek 5 menit, panjang 15 menit setiap empat fokus selesai dalam siklus harian; satu sesi running/paused per pengguna; pause/resume/cancel; fase berikutnya dimulai manual; deadline server dan reload konsisten | T-05 |
| REQ-06 | Proyek | Daftar dan Kanban menampilkan tugas yang sama; status aktif/selesai/arsip; progres menghitung tugas tidak diarsipkan | T-06 |
| REQ-07 | Dependensi | Hanya dalam proyek yang sama; tidak boleh menunjuk diri atau membentuk siklus; tugas terblokir tidak dapat diselesaikan | T-07 |
| REQ-08 | Akun keuangan | Beberapa akun IDR memiliki saldo awal; saldo dihitung dari transaksi; akun dapat diarsipkan dengan riwayat dipertahankan | T-08 |
| REQ-09 | Transaksi | Pemasukan/pengeluaran manual, kategori, tanggal, catatan, koreksi, dan pembatalan tersedia; nominal rupiah bulat positif | T-09 |
| REQ-10 | Transfer | Sumber dan tujuan berbeda, satu pemilik; kedua efek saldo berhasil atau gagal bersama; tidak masuk laporan pendapatan/belanja | T-10 |
| REQ-11 | Anggaran | Satu anggaran per kategori pengeluaran dan bulan; pengeluaran posted pada bulan lokal mengisi realisasi; kelebihan diberi teks status | T-11 |
| REQ-12 | Pengulangan dalam modul | Kemampuan turunan Tugas dan Keuangan, tanpa halaman/menu independen; harian/mingguan/bulanan, interval dan akhir opsional; tugas menjadi occurrence, keuangan menjadi draft untuk konfirmasi; tidak ada duplikat | T-12 |
| REQ-13 | Laporan historis dalam modul | Tersedia di modul sumber tanpa halaman/menu independen; filter tanggal inklusif; kejadian penyelesaian dan tugas unik dari event immutable; durasi fokus Pomodoro dari interval; snapshot proyek; jadwal habit historis; keuangan terkoreksi dengan revisi yang dapat ditelusuri | T-13 |
| REQ-14 | CSV dalam modul | Ekspor dari modul sumber; CSV mengikuti filter laporan dan pemilik; teks pengguna tidak dapat menjadi formula spreadsheet | T-14 |
| REQ-15 | Web responsif | Alur utama dapat dipakai di desktop/ponsel, lewat keyboard, dengan label, fokus terlihat, dan status selain warna | T-15 |
| REQ-16 | Koneksi dan kegagalan | Kondisi kosong/loading/error/offline tersedia; tidak menampilkan sukses sebelum server mengonfirmasi; input dipertahankan saat simpan gagal | T-16 |
| REQ-17 | Profil | Nama dan zona waktu IANA dapat diubah; default bahasa Inggris, IDR, Asia/Jakarta, dan minggu mulai Senin | T-17 |
| REQ-18 | Timebox | Dashboard menyediakan rencana blok Class, Task, Habit, dan Focus dengan waktu mulai/akhir; dapat dibuat, diubah, dan dibatalkan; rencana tidak otomatis menjalankan atau menyelesaikan aktivitas | T-18 |

## Modul utama dan kemampuan turunan

Navigasi utama mencakup Today/Dashboard, Tasks, Habits, Pomodoro, Projects, Finance, dan Settings. Timebox berada di dashboard bersama tugas, kebiasaan, dan kontrol Pomodoro. Dashboard tidak menampilkan saldo, transaksi, anggaran, ringkasan keuangan, atau draft keuangan; informasi tersebut berada di Finance.

Pengulangan REQ-12 tetap tersedia sebagai kemampuan Tugas dan Keuangan. Laporan REQ-13 serta CSV REQ-14 tersedia di modul sumber: Tugas/Proyek, Kebiasaan, Pomodoro, dan Keuangan. Ketiganya tidak mempunyai modul, menu, atau halaman mandiri; penghapusan posisi independen tidak menghapus aturan historis, revisi, atau ekspor.

Bahasa UI default adalah Inggris; dokumentasi penjelasan tetap berbahasa Indonesia. IDR, Asia/Jakarta, dan awal minggu Senin tidak berubah. Aksi semua sesi memakai label Inggris “Log out of all devices”, dengan penjelasan “You will also be logged out on this device. Log in again to continue.” Padanan Indonesia adalah “Keluar dari semua perangkat”, dengan penjelasan “Anda juga akan keluar dari perangkat ini. Anda harus login kembali untuk melanjutkan.”

## Timebox (REQ-18)

Timebox menyimpan rencana waktu mulai/akhir dengan kind class,task,habit,focus. Class adalah blok berjudul tanpa tautan aktivitas; Task/Habit menaut catatan milik pengguna; Focus boleh menaut Task dan direncanakan 25 menit. Durasi Class/Task/Habit bebas selama akhir setelah mulai. Blok yang beririsan diperbolehkan, dengan penanda konflik jadwal sebagai informasi.

Rencana dapat mencakup masa depan atau dikoreksi pada masa lampau, tanpa mengubah event tugas, check-in, transaksi, atau interval Pomodoro. Blok dapat dibatalkan dengan riwayat baris dipertahankan. Tombol aktivitas menjalankan alur modul sumber secara manual; jam Timebox tidak memicu start, check-in, penyelesaian tugas, atau fase berikutnya. Rencana Focus tidak menjamin durasi kalender aktual 25 menit bila sesi dijeda. Tampilan tanggal menggunakan zona profil saat dibuka; timestamp rencana tetap UTC. Judul rencana tidak otomatis mengikuti rename sumber.

## Aturan produk

Tugas memiliki status `todo`, `in_progress`, atau `done`; arsip merupakan atribut terpisah. `completed_at` menyatakan penyelesaian pada kondisi terkini dan dikosongkan ketika dibuka kembali. Setiap perubahan status, proyek, dan arsip mencatat TaskEvent immutable dalam transaksi yang sama; membuka kembali tidak menghapus kejadian selesai lama. Tenggat lewat tetap terlihat sampai selesai/arsip. Memindahkan tugas ditolak selama masih memiliki dependensi sebagai successor maupun predecessor.

Proyek tanpa tugas memiliki progres 0%. Menyelesaikan proyek ditolak jika masih ada tugas tidak diarsipkan yang belum selesai. Mengarsipkan proyek mempertahankan riwayat dan tidak otomatis mengarsipkan tugas. Pada proyek selesai/arsip, tugas tidak dapat dibuat, diedit, diubah status, dipindah, diarsipkan, atau di-unarchive sebelum proyek dibuka kembali. Fokus baru hanya boleh memakai tugas tidak diarsipkan berstatus todo/in_progress pada proyek aktif, atau tugas pribadi dengan kondisi yang sama. Detail transisi ada pada tabel di bawah.

Kebiasaan diukur sebagai check-in pada hari terjadwal dibanding jumlah hari terjadwal. Tanggal mulai dan zona habit immutable sejak pembuatan; zona disalin dari profil dan menjadi acuan kalender habit. Check-in sebelum tanggal mulai, pada hari tidak terjadwal, tanggal setelah archived_on, atau tanggal mendatang pada zona habit ditolak. Perubahan jadwal berlaku besok pada tanggal lokal habit dan menaikkan version Habit; jadwal lama tetap dipertahankan. Arsip menyimpan archived_on pada zona tetap habit sebagai DATE yang tidak dihitung ulang ketika zona pengguna berubah. Habit arsip tidak dapat diedit atau diubah jadwal, tetapi check-in historis masih dapat dikoreksi.

Pomodoro memakai durasi tetap untuk MVP: focus 1500 detik, short_break 300 detik, long_break 900 detik. Tidak ada pengaturan durasi, notifikasi push, atau pergantian fase otomatis. Setiap fase memiliki status running, paused, completed, atau cancelled. Pause mempertahankan sisa waktu; resume melanjutkannya. Saat waktu aktif mencapai durasi fase, server menutup fase pada deadline, termasuk bila browser tertutup. Membuka aplikasi memulihkan status server; tidak membuat fokus/istirahat berikutnya berjalan sendiri.

Satu sesi running atau paused berlaku per pengguna, baik fokus maupun istirahat. Fokus boleh tanpa tugas; istirahat selalu tanpa tugas. Hanya fokus completed menambah completed_focus_count; setiap kelipatan empat menjadwalkan long_break, lainnya short_break. Selesai/cancel istirahat kembali ke focus; cancel fokus juga kembali ke focus tanpa menambah hitungan. Pengguna boleh melewati istirahat dengan memulai lalu membatalkannya; pembatalan tetap tercatat. Hitungan memakai siklus harian, bukan akumulasi lintas hari. Setiap tanggal siklus baru mulai count=0,next_phase=focus; reload/logout tidak mereset siklus pada tanggal yang sama. Tidak ada batas empat fokus per hari: fokus keempat, kedelapan, dan seterusnya menyiapkan long_break.

Siklus memiliki tanggal dan zona IANA snapshot dari profil saat pertama dibuat untuk tanggal tersebut. Sesi menyimpan cycle_day_id saat start; fokus yang melewati tengah malam dihitung pada tanggal mulai sesi. Sesi running/paused tetap berjalan dengan siklus lama sampai terminal. Sesudah terminal, bila tanggal lokal profil telah berbeda, state beralih ke siklus tanggal saat ini dan tidak menawarkan break tertunda hari lama. Saat idle, GET/start melakukan pergantian hari sebelum membaca state atau memeriksa state_version. Pergantian hari menaikkan version State; klien dengan versi lama harus refresh.

Perubahan zona profil baru dipakai untuk memilih siklus ketika idle; sesi terbuka mempertahankan siklusnya. Satu pengguna hanya mempunyai satu siklus per tanggal: bila perubahan zona kembali ke tanggal yang pernah dipakai, gunakan hitungan dan next_phase tersimpan, bukan reset lagi. Zona pada siklus yang sudah dibuat tetap immutable. Hitungan siklus harian berbeda dari laporan historis: laporan completed memakai ended_at, sedangkan waktu fokus dibagi berdasarkan overlap interval.

| Keadaan / aksi | Perilaku |
|---|---|
| Tidak ada sesi terbuka, start | Mulai next_phase dari state server; jika focus, task_id opsional; break menolak task_id non-null |
| running, pause sebelum deadline | Tutup interval aktif dan ubah paused; sisa waktu tidak berkurang selama pause |
| paused, resume | Buat interval aktif baru dan hitung due_at dari sisa waktu |
| running mencapai due_at | completed pada due_at; tutup interval dan perbarui next_phase/hitungan sekali |
| running/paused, cancel | cancelled; simpan durasi aktual dan Day sesi.next_phase=focus; pergantian hari diterapkan sesudah finalisasi |
| Fokus terbuka, tugas selesai/pindah/arsip | Tolak POMODORO_IN_PROGRESS; selesaikan atau batalkan fokus dahulu |
| Fokus terbuka, edit judul/deskripsi/prioritas/tenggat atau todo/in_progress | Diizinkan; snapshot tugas/proyek pada sesi tidak berubah |
| Fokus terbuka, proyek selesai/arsip | Tolak POMODORO_IN_PROGRESS |
| Fase terminal, pause/resume/cancel | Tolak INVALID_STATE; cancel pada cancelled dengan version terkini merupakan no-op |
| Deadline terlewati saat request mutasi | Rekonsiliasi deadline dahulu, baru periksa versi/status request; versi usang meminta refresh |

Laporan fokus memakai interval running pada sesi focus completed/cancelled, tanpa durasi pause atau istirahat. Sesi terbuka ditampilkan terpisah dan belum masuk total final. Durasi fase completed dibatasi durasi rencana; fokus yang dibatalkan tidak dihitung sebagai satu Pomodoro selesai. Catatan menunjukkan waktu fase berjalan, bukan bukti perhatian pengguna.

Saldo boleh negatif untuk merefleksikan pencatatan manual. Saldo awal dapat dikoreksi, tetapi bukan transaksi pendapatan. Draft tidak memengaruhi saldo atau anggaran. Koreksi transaksi posted menghitung ulang saldo/laporan; setiap create/edit/post/void menambah revisi immutable dalam transaksi yang sama. Pembatalan mempertahankan catatan dengan status `void`. Koreksi saldo awal juga memiliki catatan perubahan immutable. Transaksi keuangan memakai tanggal lokal tanpa jam dan tidak boleh posted di masa depan.

Pengulangan memakai tanggal mulai dan zona waktu yang disimpan pada aturan. Harian bertambah sejumlah hari, mingguan sejumlah minggu pada hari yang sama, bulanan sejumlah bulan pada tanggal awal; tanggal 29/30/31 memakai akhir bulan bila perlu tanpa mengubah tanggal acuan berikutnya. Job mengejar semua tanggal yang telah jatuh tempo, termasuk saat layanan sempat mati.

Edit aturan hanya berlaku pada tanggal setelah cutoff=max(hari lokal saat edit,last_generated_date). Occurrence lama tidak diubah dan menyimpan rule_version pembentuknya. version aturan adalah versi konfigurasi; worker yang memperbarui cursor tidak menaikkannya. Setiap perubahan konfigurasi termasuk stop menghasilkan revisi immutable. Tidak ada pause/resume aturan; stopped/expired tidak dapat diaktifkan lagi.

| Aksi / kondisi pengulangan | Perilaku |
|---|---|
| Create | version=1 dan revisi awal; worker mengejar tanggal jatuh tempo |
| Worker memproses tanggal | Buat occurrence dan maju cursor atomik; version tetap |
| Edit aturan aktif | Catch-up memakai konfigurasi lama sampai cutoff, lalu revisi baru hanya untuk tanggal setelah cutoff |
| Catch-up >100 occurrence saat edit/stop | Tolak RECURRENCE_CATCHUP_PENDING tanpa perubahan; worker mengejar, pengguna mencoba lagi |
| Stop aktif | Catch-up dahulu lalu status=stopped dan versi konfigurasi baru; occurrence lama tetap |
| Proyek tugas selesai/arsip | Generasi terblokir, cursor tidak maju; buka proyek kembali untuk catch-up |
| Stop aturan terblokir proyek | Langsung hentikan tanpa catch-up; tanggal belum terbentuk tidak akan dibuat |
| Jadwal melewati end_date | status=expired dan next_date=null tanpa menaikkan version; revisi konfigurasi terakhir tetap |
| Edit stopped/expired | Tolak INVALID_STATE; stop ulang dengan versi terkini no-op |

Tugas berulang tidak menyalin dependensi. Draft transaksi dapat dikonfirmasi, diedit, atau dibatalkan tanpa mengubah revisi template.

Laporan penyelesaian tugas membaca TaskEvent menuju done, bukan completed_at terkini. Tugas selesai, dibuka kembali, lalu selesai lagi menghasilkan dua kejadian penyelesaian dan satu tugas unik. Pengelompokan proyek/judul menggunakan snapshot saat kejadian; pindah/rename/arsip tidak memindahkan sejarah. Progres proyek tetap mencerminkan kondisi Task saat ini, sehingga berbeda dari hitungan penyelesaian historis.

Interval fokus yang melintasi tanggal dibagi menurut overlap rentang laporan. Timestamp event/interval tetap UTC; perubahan zona pengguna boleh mengubah pengelompokan tanggal tampilan, tetapi tidak mengubah timestamp, snapshot proyek, tanggal transaksi/check-in, archived_on, zona habit, atau zona aturan. Batas rentang lokal mengikuti zona pengguna saat request.

Laporan keuangan membaca transaksi terkoreksi saat ini, sehingga koreksi/void dapat mengubah laporan periode lampau secara sengaja. Revisi menjelaskan perubahan; laporan bukan snapshot laporan lama yang dibekukan. Anggaran juga memakai rencana terkini, bukan histori perubahan rencana. Transfer, draft, void, dan saldo awal dikecualikan dari arus uang.

## Batas versi pertama

Tidak mencakup kolaborasi, integrasi bank, multi-mata uang, lampiran, notifikasi push, sinkronisasi offline, pencatat waktu bebas/koreksi durasi Pomodoro, dependensi lintas proyek, atau akuntansi double-entry lengkap. Hubungan biaya ke proyek juga ditunda.

Arah identitas visual ada di [DESIGN](DESIGN.md). Wireframe menjadi referensi susunan fitur; keputusan revisi 0.3 di dokumen ini menggantikan anotasi wireframe yang masih menyebut Timebox sebagai usulan. Alur dan penerimaan mengikuti [UX-FLOWS](UX-FLOWS.md).

Detail data ada di [SCHEMA](SCHEMA.md), kontrak di [API-SPEC](API-SPEC.md), dan skenario uji di [TEST-PLAN](TEST-PLAN.md).
