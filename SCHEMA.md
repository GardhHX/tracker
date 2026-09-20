# Skema Data Tracker

Versi 0.3. Tanggal: 16 September 2026. Status: spesifikasi PostgreSQL, belum menjadi database atau migrasi. [ERD](ERD.md) menunjukkan relasi; [PRD](PRD.md) menetapkan perilaku dan transisi.

## Konvensi

Entitas bisnis biasa memiliki id UUID PK, user_id UUID NOT NULL FK User, created_at/updated_at TIMESTAMPTZ, dan version INT NOT NULL DEFAULT 1. Pengecualian dicantumkan eksplisit. Waktu berasal dari server, dinormalisasi ke presisi milidetik dan disimpan UTC. Field bertanda ? nullable; lainnya wajib. Field relasi pemilik, metadata server, snapshot, dan cursor tidak dapat ditulis klien.

Uang memakai BIGINT rupiah bulat; JSON memakai string digit. Nominal transaksi/anggaran positif; saldo boleh negatif. Tanggal bisnis DATE dan zona waktu nama IANA. Enum memakai PostgreSQL enum atau CHECK dengan nilai persis pada dokumen. Batas teks berlaku setelah trim; string wajib tidak boleh kosong.

Arsip mempertahankan catatan. DELETE fisik hanya untuk TaskDependency, HabitCheckIn, dan Budget. FK bisnis RESTRICT. Event, revisi, dan interval yang sudah ditutup tidak boleh diubah/dihapus melalui API; role runtime melarang UPDATE/DELETE tabel event/revisi. Interval hanya boleh mengisi ended_at sekali dari null.

Mutasi nyata menaikkan version sekali; no-op tidak menaikkannya. Version aturan pengulangan khusus konfigurasi, bukan progres worker. Mutasi dan penciptaan event/revisi satu transaksi. UNIQUE(user_id,id) pada setiap entitas bisnis yang direferensikan memungkinkan FK komposit pemilik.

## Identitas dan sistem (M0)

| Entitas | Field | Constraint / indeks |
|---|---|---|
| User | id UUID PK, email TEXT, name TEXT, email_verified_at TIMESTAMPTZ?, password_hash TEXT?, timezone TEXT default Asia/Jakarta, session_version INT default 1, version INT default 1, created_at,updated_at | UNIQUE email trim/lowercase; nama 1..100; email maksimal 254; tidak memiliki user_id/arsip |
| AuthAccount | id UUID PK,user_id FK,provider TEXT,provider_account_id TEXT,created_at | UNIQUE(provider,provider_account_id); provider=google; tanpa version/updated_at |
| AuthLinkIntent | id UUID PK,user_id FK,intent_hash TEXT,session_binding_hash TEXT,expires_at TIMESTAMPTZ,used_at TIMESTAMPTZ?,created_at | UNIQUE intent_hash; bound ke sid sesi server, sekali pakai, umur 10 menit; tanpa version/updated_at; indeks expires_at |
| AuthToken | id UUID PK,user_id FK,purpose ENUM(email_verify,password_reset,password_setup),token_hash TEXT,expires_at TIMESTAMPTZ,used_at TIMESTAMPTZ?,created_at | UNIQUE token_hash; sekali pakai; tanpa version/updated_at; indeks expires_at |
| EmailOutbox | id UUID PK,dedupe_key TEXT,recipient TEXT,template TEXT,payload_ciphertext TEXT?,status ENUM(pending,sending,sent,failed),attempts INT,next_attempt_at TIMESTAMPTZ,locked_until TIMESTAMPTZ?,created_at,updated_at | UNIQUE dedupe_key; payload dienkripsi dan dibersihkan setelah sent/expired; tanpa user_id/version; indeks(status,next_attempt_at) |
| IdempotencyRecord | id UUID PK,user_id FK,key TEXT,method TEXT,route TEXT,request_hash TEXT,response_status INT,response_json JSONB,expires_at TIMESTAMPTZ,created_at | UNIQUE(user_id,key); retensi 24 jam; hanya respons bisnis nonrahasia; tanpa version/updated_at |
| RateLimitBucket | bucket_hash TEXT PK,window_start TIMESTAMPTZ,count INT,expires_at TIMESTAMPTZ | hash namespace/IP/email; increment/reset window atomik; tanpa metadata bisnis; indeks expires_at |

JWT membawa sub,sid acak per login,recent_auth_at server,dan session_version; tidak ada tabel Session. Semua akses protected memeriksa versi sesi pada User. Kata sandi/reset/logout-all tidak mengubah versi profil kecuali field profil ikut berubah; pencabutan memakai session_version terpisah. Hash/token tidak keluar ke API.

## Proyek dan tugas (M1; dependensi M4)

| Entitas | Field khusus | Constraint / indeks |
|---|---|---|
| Project | name TEXT,description TEXT?,status ENUM(active,completed,archived),completed_at TIMESTAMPTZ?,archived_at TIMESTAMPTZ? | nama 1..120; description maksimal 5000; active: kedua timestamp null; completed: completed_at terisi, archived_at null; archived: archived_at terisi, completed_at boleh mempertahankan penyelesaian sebelumnya; indeks(user_id,status) |
| Task | project_id UUID? FK Project,title TEXT,description TEXT?,status ENUM(todo,in_progress,done),priority ENUM(low,medium,high),due_date DATE?,completed_at TIMESTAMPTZ?,archived_at TIMESTAMPTZ? | judul 1..200; description maksimal 5000; done iff completed_at terisi; indeks(user_id,status,due_date),(project_id,status) |
| TaskEvent | id UUID PK,user_id FK,task_id FK,task_version INT,event_type ENUM(created,edited,status_changed,project_changed,archived,unarchived),from_status ENUM(todo,in_progress,done)?,to_status ENUM(todo,in_progress,done),previous_project_id UUID? FK Project,project_id_at_event UUID? FK Project,task_title_snapshot TEXT,project_name_snapshot TEXT?,archived BOOL,occurred_at TIMESTAMPTZ | UNIQUE(task_id,task_version); tanpa version/updated_at; immutable; indeks(user_id,occurred_at),(task_id,occurred_at),(project_id_at_event,occurred_at) |
| TaskDependency | user_id FK,task_id FK Task,predecessor_id FK Task,created_at TIMESTAMPTZ | PK(task_id,predecessor_id); tanpa id/version/updated_at; satu proyek non-null/satu pemilik; tidak self/cycle; indeks predecessor_id |

Task create menghasilkan event created. PATCH menghasilkan edited atau project_changed jika proyek berubah. Status/arsip menghasilkan event yang bersesuaian. Satu mutasi Task yang nyata menghasilkan satu TaskEvent pada task_version baru, berisi keadaan setelah mutasi. No-op tidak membuat event. from_status null hanya saat create; previous_project_id menyimpan relasi sebelum mutasi. Snapshot judul/proyek diambil saat event, tidak diperbarui ketika label asal berubah.

Laporan selesai memakai event_type=status_changed dan to_status=done. completed_at hanya menunjukkan kondisi Task sekarang. Dua penyelesaian setelah reopen merupakan dua event, satu tugas unik. Progres Project memakai Task terkini yang tidak diarsipkan.

Mutasi tugas pada proyek nonaktif ditolak. Pindah tugas memerlukan proyek sumber/tujuan aktif dan tanpa edge keluar/masuk. Menambah dependensi pada successor done ditolak bila predecessor belum done. Membuka predecessor done kembali ditolak bila successor done. Mengarsipkan predecessor belum done yang masih dipakai ditolak; predecessor done boleh diarsipkan dan tetap memenuhi relasi.

## Kebiasaan (M2)

| Entitas | Field khusus | Constraint / indeks |
|---|---|---|
| Habit | name TEXT,start_date DATE,timezone TEXT,archived_at TIMESTAMPTZ?,archived_on DATE? | nama 1..120; start_date/timezone immutable sejak create; timezone snapshot profil; archived_at/archived_on keduanya null atau terisi; indeks(user_id,archived_on) |
| HabitSchedule | id UUID PK,user_id FK,habit_id FK,effective_from DATE,weekdays SMALLINT[],created_at | UNIQUE(habit_id,effective_from); weekdays subset unik 1..7, minimal satu; tanpa version/updated_at |
| HabitCheckIn | id UUID PK,user_id FK,habit_id FK,date DATE,checked_at TIMESTAMPTZ,created_at | UNIQUE(habit_id,date); tanpa version/updated_at; indeks(user_id,date) |

Habit dan jadwal awal dibuat atomik; timezone disalin dari profil saat create dan semua kalender/check-in/jadwal/arsip habit memakai zona tetap tersebut; effective_from awal=start_date. POST jadwal baru hanya besok lokal habit dan memerlukan version Habit. Mengganti jadwal besok yang belum berlaku diperbolehkan, tetapi jadwal yang sudah berlaku immutable. Penciptaan/penggantian jadwal menaikkan version Habit. Habit arsip tidak menerima perubahan nama/jadwal atau unarchive.

Check-in harus pada tanggal terjadwal, >=start_date, <=hari lokal habit, dan <=archived_on bila arsip. DELETE check-in pada tanggal valid idempotent. archived_on diambil sekali saat arsip dengan zona tetap habit; perubahan zona tidak menghitung ulang batas historis. Nama habit pada laporan memakai nama terkini; perubahan label tidak mengubah denominator atau tanggal.

## Pomodoro (M2)

| Entitas | Field | Constraint / indeks |
|---|---|---|
| PomodoroDay | field bisnis biasa; cycle_date DATE,timezone TEXT,next_phase ENUM(focus,short_break,long_break) default focus,completed_focus_count INT default 0 | UNIQUE(user_id,cycle_date); timezone snapshot profil, tanggal/zona immutable; count>=0; hanya service Pomodoro mengubah fase/count |
| PomodoroState | user_id UUID PK FK User,cycle_day_id UUID? FK PomodoroDay,next_phase ENUM(focus,short_break,long_break) default focus,completed_focus_count INT default 0,version INT default 1,updated_at TIMESTAMPTZ | satu per user; dibuat di M0 tanpa id/created_at; cycle_day_id awal null; fase/count adalah cache dari Day terpilih; FK komposit pemilik |
| PomodoroSession | field bisnis biasa; cycle_day_id UUID FK PomodoroDay,phase ENUM(focus,short_break,long_break),status ENUM(running,paused,completed,cancelled),planned_seconds INT,task_id UUID? FK Task,project_id_at_start UUID? FK Project,task_title_snapshot TEXT?,project_name_snapshot TEXT?,started_at TIMESTAMPTZ,due_at TIMESTAMPTZ?,ended_at TIMESTAMPTZ? | partial UNIQUE(user_id) WHERE status IN(running,paused); planned_seconds=1500/300/900 sesuai phase; break task/project/snapshot null; indeks(user_id,started_at),(status,due_at) |
| PomodoroInterval | id UUID PK,user_id FK,session_id FK PomodoroSession,started_at TIMESTAMPTZ,ended_at TIMESTAMPTZ? | partial UNIQUE(session_id) WHERE ended_at IS NULL; ended_at>=started_at; tanpa version/updated_at/created_at; indeks(session_id,started_at) |

PomodoroDay lalu PomodoroState dibuat di M0; Day dibuat lazy pada akses Pomodoro, bukan satu baris per hari lewat cron. Sesi/interval dibuat di M2 dan cycle_day_id wajib serta immutable sejak start. State awal belum memilih Day; GET pertama memilih/membuat Day dan menaikkan version State. Urutan 0001..0005 merupakan target migrasi spesifikasi, bukan bukti migrasi runtime telah diterapkan.

Sesi running memiliki due_at terisi, ended_at null, tepat satu interval terbuka. Paused memiliki due_at/ended_at null dan tidak memiliki interval terbuka. Terminal memiliki due_at null, ended_at terisi, semua interval tertutup. Snapshot fokus immutable sejak start; tidak ada perubahan task_id, phase, planned_seconds, atau snapshot.

Start membuat sesi/interval dan menaikkan version State. Pause menutup interval pada server_now dan menaikkan version Session. Resume membuat interval baru; due_at=server_now+(planned_ms-total_closed_interval_ms). Cancel menutup interval jika running, menetapkan ended_at=server_now, status cancelled, dan menaikkan version Session/State. Day sesi.next_phase menjadi focus tanpa mengubah count; Day version naik hanya jika fase berubah. State cache mengikuti Day sesi.

Jika running mencapai due_at, rekonsiliasi menutup interval tepat pada due_at dan ended_at=due_at, bukan waktu worker/request yang terlambat. Session menjadi completed, version naik. Jika focus, count Day sesi bertambah sekali dan Day.next_phase=long_break bila count kelipatan empat, selain itu short_break. Jika break, Day.next_phase=focus. Day version naik pada perubahan nyata; State cache diselaraskan dan version naik sekali per finalisasi. Tidak membuat sesi berikutnya.

Semua mutasi Pomodoro, GET state/history, dan laporan merekonsiliasi deadline milik pengguna sebelum memeriksa versi/membaca hasil. Worker menjalankan service yang sama; rekonsiliasi status terminal no-op sehingga count tidak bertambah dua kali. GET boleh merealisasikan fase yang secara waktu sudah selesai, tetapi tidak memulai fase/aksi pengguna baru.

Fokus running/paused memblokir done/pindah/arsip Task terkait dan complete/archive Project terkait. Edit teks/prioritas/tenggat atau todo/in_progress boleh; snapshot tidak berubah. Break tidak memblokir tugas/proyek karena tidak terikat tugas. Saat deadline lewat, rekonsiliasi sebelum aturan blokir sehingga fase yang selesai tidak menghalangi mutasi.

Laporan mengambil interval tertutup dari focus completed/cancelled, menghitung overlap rentang UTC, menjumlahkan milidetik dahulu lalu floor ke detik sekali. Istirahat/pause/sesi terbuka tidak masuk total final. Sesi cancelled memiliki waktu aktual tetapi tidak menambah completed_focus_count. Fase terminal dan intervalnya immutable.

Pergantian hari: service menghitung tanggal lokal profil dari server_now. Bila sesi terbuka, State tetap menunjuk Day sesi; hitungan hari ini dibaca terpisah dari Day tanggal saat ini. Bila idle, pilih/create Day tanggal saat ini, lalu salin next_phase/count ke State. Day baru mulai focus/0; bila tanggal sudah ada, gunakan data tersimpan. Perubahan zona profil berlaku untuk pemilihan Day saat idle; timezone Day lama tidak ditulis ulang. Fokus lintas tengah malam menambah Day saat start, walau ended_at jatuh pada hari berikutnya. Finalisasi sesi lama dilakukan dahulu, baru pergantian State; setiap operasi nyata menaikkan version sehingga start memakai versi sebelum rollover dapat ditolak.

## Timebox (M2; REQ-18)

| Entitas | Field khusus | Constraint / indeks |
|---|---|---|
| TimeboxEntry | kind ENUM(class,task,habit,focus),title TEXT,starts_at TIMESTAMPTZ,ends_at TIMESTAMPTZ,task_id UUID? FK Task,habit_id UUID? FK Habit,status ENUM(planned,cancelled) default planned,cancelled_at TIMESTAMPTZ? | metadata bisnis biasa; judul 1..200; ends_at>starts_at; focus durasi rencana 1500 detik; class: kedua FK null; task: task_id wajib/habit_id null; habit: habit_id wajib/task_id null; focus: habit_id null/task_id opsional; cancelled iff cancelled_at terisi; indeks(user_id,starts_at),(user_id,ends_at) |

Semua FK memakai pemilik komposit. Referensi baru atau yang diganti harus Task todo/in_progress tidak diarsipkan dengan Project aktif, atau Habit tidak diarsipkan. Referensi lama tetap dipertahankan bila sumber kemudian selesai/arsip; edit waktu/judul tanpa mengganti referensi dan cancel tetap boleh. kind dan tautan dapat diganti melalui PATCH dengan seluruh kombinasi FK valid pada keadaan hasil.

Overlap tidak dilarang DB; list harian memilih starts_at<akhir_hari_UTC AND ends_at>awal_hari_UTC. status cancelled immutable selain no-op cancel pada versi terkini; tidak ada restore atau DELETE fisik. Edit rencana lampau tidak membuat/mengubah TaskEvent, check-in, FinanceTransaction, atau interval Pomodoro. Tidak ada FK dari rencana ke sesi aktual dan tidak ada worker yang mengeksekusi blok. Judul adalah label rencana tersimpan.

## Keuangan dan riwayat (M3)

| Entitas | Field khusus | Constraint / indeks |
|---|---|---|
| FinanceAccount | name TEXT,type ENUM(cash,bank,ewallet),opening_balance BIGINT,archived_at TIMESTAMPTZ? | nama 1..120; IDR implisit; indeks(user_id,archived_at) |
| FinanceAccountBalanceChange | id UUID PK,user_id FK,account_id FK FinanceAccount,account_version INT,previous_balance BIGINT?,new_balance BIGINT,changed_at TIMESTAMPTZ | UNIQUE(account_id,account_version); create previous_balance=null; hanya perubahan saldo awal membuat baris; tanpa version/updated_at; immutable |
| Category | name TEXT,type ENUM(income,expense),archived_at TIMESTAMPTZ? | nama 1..100; UNIQUE(user_id,type,lower(name)); type immutable sejak create |
| FinanceTransaction | type ENUM(income,expense,transfer),status ENUM(draft,posted,void),account_id FK FinanceAccount,to_account_id UUID? FK FinanceAccount,category_id UUID? FK Category,amount BIGINT,date DATE,note TEXT?,posted_at TIMESTAMPTZ?,voided_at TIMESTAMPTZ? | amount>0; note maksimal 2000; transfer tujuan wajib/berbeda dan kategori null; selain transfer kategori wajib sesuai type/tujuan null; indeks(user_id,date,status),(account_id,status),(to_account_id,status) |
| FinanceTransactionRevision | id UUID PK,user_id FK,transaction_id FK FinanceTransaction,transaction_version INT,action ENUM(created,edited,posted,voided),snapshot JSONB,changed_at TIMESTAMPTZ | UNIQUE(transaction_id,transaction_version); immutable; tanpa version/updated_at; indeks(transaction_id,transaction_version) |
| Budget | category_id FK Category,month DATE,limit_amount BIGINT | month hari pertama; kategori expense; limit>0; UNIQUE(user_id,category_id,month) |

Snapshot revisi memakai objek field FinanceTransaction sesudah perubahan: id,type,status,account_id,to_account_id,category_id,amount,date,note,posted_at,voided_at,version; mulai M4 tambahkan recurrence_rule_id,occurrence_date,rule_version. ID/string uang/tanggal mengikuti format API. Tidak memasukkan user_id atau rahasia. Revisi lama tidak diubah saat kolom M4 ditambahkan; tiga key recurrence yang tidak ada berarti null. Mapper respons menambah tiga key null pada snapshot revisi lama tanpa menulis ulang JSON tersimpan.

Create/edit/post/void nyata menghasilkan satu revisi pada versi transaksi baru. Koreksi posted mempertahankan posted_at pertama dan status posted. Void dari draft boleh posted_at null; voided_at wajib. Void tidak boleh diedit/posted kembali. Post ulang pada posted dengan versi terkini no-op. Catatan revisi tidak digunakan dua kali pada saldo; saldo/laporan memakai baris transaksi terkini.

Saldo=opening_balance+income posted+transfer masuk posted-expense posted-transfer keluar posted. Satu transfer satu baris, dua efek saldo dalam satu commit; tidak ada current_balance tersimpan. Saldo awal bukan pendapatan; koreksi saldo awal menghasilkan FinanceAccountBalanceChange atomik.

Akun/kategori arsip tidak menerima referensi transaksi baru/edit/konfirmasi draft. Void transaksi lama tetap boleh. Arsip ditolak jika ada aturan pengulangan aktif yang merujuk entitas; hentikan dahulu. Draft lama tetap ada dengan alasan terblokir. Opening balance boleh dikoreksi pada akun aktif saja; histori perubahan tersedia. Semua referensi satu pemilik.

Laporan arus uang periode lampau dapat berubah akibat koreksi/void transaksi yang disengaja. Koreksi saldo awal mengubah saldo akun terkini, tetapi tidak mengubah arus income/expense karena saldo awal selalu dikecualikan. Revisi menyediakan penelusuran perubahan; tidak menjanjikan laporan beku atau histori saldo harian. Budget memakai rencana terkini dan boleh dihapus tanpa menghapus transaksi.

Pengulangan adalah kemampuan turunan Tasks dan Finance. Tabel aturan/revisi berikut tetap dibutuhkan walau tidak ada modul mandiri. Laporan/CSV memakai sumber data modul masing-masing, tanpa tabel laporan global atau duplikasi data dashboard.

## Pengulangan dan revisi konfigurasi (M4)

| Entitas | Field khusus | Constraint / indeks |
|---|---|---|
| TaskRecurrenceRule | title TEXT,description TEXT?,project_id UUID? FK Project,priority ENUM(low,medium,high),frequency ENUM(daily,weekly,monthly),interval INT,start_date DATE,end_date DATE?,timezone TEXT,status ENUM(active,stopped,expired) default active,next_date DATE?,last_generated_date DATE?,processing_updated_at TIMESTAMPTZ? | template sama batas Task; interval 1..365; end>=start; indeks(status,next_date) |
| FinanceRecurrenceRule | type ENUM(income,expense,transfer),account_id FK FinanceAccount,to_account_id UUID? FK FinanceAccount,category_id UUID? FK Category,amount BIGINT,note TEXT?,frequency,interval,start_date,end_date?,timezone,status,next_date?,last_generated_date?,processing_updated_at? | template sama aturan transaksi; field jadwal/progres sama tipe TaskRecurrenceRule; indeks(status,next_date) |
| TaskRecurrenceRevision | id UUID PK,user_id FK,rule_id FK TaskRecurrenceRule,rule_version INT,action ENUM(created,edited,stopped),effective_after DATE?,snapshot JSONB,changed_at TIMESTAMPTZ | UNIQUE(rule_id,rule_version) dan UNIQUE(user_id,rule_id,rule_version); awal effective_after=null; immutable; tanpa version/updated_at |
| FinanceRecurrenceRevision | id UUID PK,user_id FK,rule_id FK FinanceRecurrenceRule,rule_version INT,action ENUM(created,edited,stopped),effective_after DATE?,snapshot JSONB,changed_at TIMESTAMPTZ | UNIQUE(rule_id,rule_version) dan UNIQUE(user_id,rule_id,rule_version); sama mekanisme aturan tugas; immutable |

Kedua Rule memakai metadata bisnis biasa. version adalah versi konfigurasi yang naik pada edit/stop, bukan pada cursor/expiry. Worker hanya memperbarui next_date,last_generated_date,status expiry,processing_updated_at. updated_at menyatakan perubahan konfigurasi. start_date/timezone immutable sejak create. Status nonaktif memiliki next_date=null. Active yang terblokir proyek tetap status active dengan blocked_reason terhitung.

Snapshot konfigurasi memuat template dan frequency,interval,start_date,end_date,timezone; tanpa cursor/status expiry/metadata. Action stopped menjelaskan penghentian konfigurasi. Occurrence Task/FinanceTransaction memperoleh recurrence_rule_id UUID?,occurrence_date DATE?,rule_version INT? pada M4; ketiganya semua null atau semua terisi. UNIQUE(recurrence_rule_id,occurrence_date); FK rule_version ke revisi unik (user_id,rule_id,rule_version) menjaga versi pembentuk.

Create menambah revisi v1. Worker mengunci User/resource/rule, menghasilkan occurrence dan memajukan cursor satu transaksi. Generasi tidak mengubah version. Setelah melewati end_date, status=expired,next_date=null tanpa revisi konfigurasi baru. Retry/crash tidak menggandakan occurrence karena unique key tetap ada meski occurrence void/arsip.

Edit/stop aktif melakukan catch-up menggunakan konfigurasi lama sampai cutoff=max(hari lokal aturan saat request,last_generated_date). Batas 100 occurrence per request; bila melebihi, 409 RECURRENCE_CATCHUP_PENDING tanpa perubahan termasuk tanpa catch-up parsial. Worker menyelesaikan backlog, pengguna retry dengan version konfigurasi yang tetap. Setelah catch-up, edit membuat revisi version+1 dengan effective_after=cutoff dan next_date pertama jadwal baru >cutoff. Stop membuat revisi stopped dan status stopped,next_date=null. Validasi/edit/revisi atomik.

Jika catch-up pada edit mencapai end_date lama, edit yang sedang diminta tetap boleh memperpanjang end_date dan menghasilkan revisi baru dalam transaksi itu; status hasil active bila ada next_date baru, selain itu expired. Aturan yang sudah expired sebelum request tidak boleh diedit. Stop setelah catch-up selalu berakhir stopped. Stop ulang nonaktif dengan versi terkini no-op.

Aturan tugas pada proyek selesai/arsip terblokir dan tidak memajukan cursor. Edit terblokir ditolak PROJECT_NOT_ACTIVE; stop terblokir boleh langsung stopped tanpa catch-up. Membuka kembali proyek memungkinkan catch-up. Template akun/kategori aktif diperlukan pada setiap generasi keuangan; status arsip tidak dapat terjadi selama aturan aktif melalui API standar.

Occurrence Task memakai template, status todo,due_date=occurrence_date,tanpa dependensi, serta TaskEvent created pada transaksi yang sama. Occurrence keuangan memakai date=occurrence_date,status draft dan revisi created. Metadata recurrence pada occurrence immutable walaupun pengguna mengubah tenggat/tanggal transaksi secara manual.

## Urutan migrasi dan integritas

M0: identitas/sistem, PomodoroDay lalu PomodoroState tanpa FK ke sesi. M1: Project,Task,TaskEvent tanpa kolom recurrence. M2: Habit/jadwal/check-in, PomodoroSession/Interval lalu TimeboxEntry setelah Task/Habit tersedia. M3: keuangan/revisi/anggaran tanpa recurrence. M4: aturan dan revisi lebih dahulu, lalu ALTER Task/FinanceTransaction menambah tiga kolom nullable, unique/check/FK, dan TaskDependency. Data lama memakai tiga null tanpa event/revisi buatan. Tidak ada migrasi yang merujuk tabel masa depan.

FK relasi bisnis menggunakan (user_id,referenced_id) menuju (user_id,id); FK occurrence versi memakai tiga kolom sebagaimana di atas. Conditional type/jadwal/cycle/transisi diperiksa service di transaksi; CHECK menangani bentuk/nominal/timestamp.

Semua mutasi bisnis dan rekonsiliasi mengunci User dahulu; kemudian Project terkait urut UUID, akun keuangan urut UUID, kategori urut UUID, dan aturan. Worker memilih User SKIP LOCKED, baru mengunci resource/rule. Pengguna berbeda berjalan paralel. Query laporan membaca snapshot konsisten setelah rekonsiliasi; ringkasan dan ekspor memakai service perhitungan identik. Retry deadlock/serialization terbatas lalu 409; timeouts tidak dianggap gagal commit.

## Retensi

Event/revisi/interval final dan catatan bisnis tidak dihapus otomatis. Token verify/setup 24 jam, reset 30 menit; penerbitan baru menonaktifkan token tujuan sama. Worker membersihkan idempotency/rate-limit expired dan payload outbox. Penghapusan akun penuh belum tersedia; tidak menambah endpoint delete akun secara implisit.
