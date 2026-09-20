# Kontrak API Tracker

Versi 0.4. Tanggal: 20 September 2026. Status: kontrak rancangan; endpoint belum diimplementasikan. [SCHEMA](SCHEMA.md) menetapkan data dan constraint; [PRD](PRD.md) menetapkan transisi. Revisi 0.4 hanya mengganti penyedia flow Google OAuth dari Auth.js ke library OIDC di API custom (DECISIONS D-43/D-45); kontrak endpoint, DTO, dan proteksi lain tidak berubah.

## HTTP, versi, dan idempotensi

API kustom memakai /api/v1, JSON snake_case, sesi cookie, Origin yang diizinkan, dan X-CSRF-Token pada mutasi. Field tidak dikenal ditolak. UUID, ISO 8601 UTC, DATE YYYY-MM-DD; uang string digit rupiah dalam batas BIGINT (saldo boleh negatif). user_id, timestamp server, cursor, snapshot, phase/status Pomodoro, dan metadata recurrence occurrence tidak dapat ditulis klien.

Resource bisnis memerlukan email terverifikasi. Auth publik merupakan pengecualian; profil minimal read-only dan logout tersedia untuk sesi belum terverifikasi. GET auth/csrf publik menghasilkan {data:{token}} dengan cookie binding bertanda tangan HttpOnly, umur 1 jam; binding dirotasi saat login/logout. Flow OAuth Google memakai proteksi state/PKCE/nonce dari library OIDC, bukan token CSRF kustom ini.

Sukses tunggal {data:DTO}; list {data:DTO[],meta:{page,page_size,total}}. POST create 201, GET/PATCH/aksi 200, DELETE 204; pengecualian auth email 202 dan jadwal habit disebutkan di tabel. Semua respons personal memakai Cache-Control: private, no-store. API bisnis tidak mengembalikan user_id atau field rahasia.

Mutasi edit/status/arsip/cancel/pause/resume memerlukan version resource. Start Pomodoro memerlukan state_version. Version harus cocok; no-op pada versi terkini tidak mengubah versi/event/timestamp. Recurrence.version khusus konfigurasi; worker tidak menaikkannya. CHECK versi dilakukan setelah rekonsiliasi deadline Pomodoro untuk request yang relevan; jika versi menjadi usang, 409 VERSION_CONFLICT dan klien refresh.

Idempotency-Key wajib pada seluruh POST penciptaan bisnis, POST jadwal habit, Pomodoro start, dan transaksi post. Panjang 8..128; UUID disarankan. Auth/aksi status biasa tidak memakai kunci tersebut. Key/payload sama memutar ulang status/body sukses 24 jam, dengan Idempotency-Replayed:true; key sama/payload berbeda 409. Versi usang pada replay sukses tidak dievaluasi ulang; klien mengambil state/resource terbaru setelah replay karena respons tersimpan dapat lebih lama dari kondisi sekarang. Respons/idempotency/domain/event satu commit.

Contoh error sintetis:

```json
{
  "error": {
    "code": "POMODORO_IN_PROGRESS",
    "message": "Complete or cancel the focus session before completing the task.",
    "fields": {},
    "request_id": "example-request-02"
  }
}
```

| HTTP | Code | Makna |
|---|---|---|
| 400 | INVALID_JSON | JSON tidak terbaca |
| 401 | UNAUTHENTICATED | Sesi hilang/expired/dicabut |
| 403 | EMAIL_UNVERIFIED / CSRF_INVALID / REAUTH_REQUIRED | Verifikasi, origin/token, atau login ulang diperlukan |
| 404 | NOT_FOUND | Tidak ada atau bukan milik pengguna |
| 409 | VERSION_CONFLICT / IDEMPOTENCY_CONFLICT / DUPLICATE_RESOURCE | Versi/key/unique bertabrakan |
| 409 | POMODORO_ALREADY_ACTIVE / POMODORO_IN_PROGRESS | Sesi running/paused ada atau memblokir mutasi terkait |
| 409 | TASK_BLOCKED / DEPENDENCY_CYCLE / RESOURCE_IN_USE | Aturan integritas melarang aksi |
| 409 | PROJECT_NOT_ACTIVE / RECURRENCE_CATCHUP_PENDING / INVALID_STATE | Status/backlog tidak mengizinkan aksi |
| 422 | VALIDATION_ERROR / INVALID_QUERY / RANGE_TOO_LARGE | Isian/query/range invalid |
| 429 | RATE_LIMITED | Sertakan Retry-After |
| 500 | INTERNAL_ERROR | Pesan umum tanpa detail sensitif |
| 503 | SERVICE_UNAVAILABLE | Layanan utama unavailable |

## DTO respons eksplisit

BaseResource = id,version,created_at,updated_at; semua field berikut ditambahkan ke base kecuali disebutkan berbeda. Tanda ? berarti nilai dapat null, bukan key boleh hilang. Mapper sebelum M4 mengembalikan metadata recurrence occurrence sebagai null tanpa membutuhkan kolom M4.

| DTO | Field respons |
|---|---|
| MeVerified (tanpa base) | id,email,name,email_verified_at,timezone,version,has_password BOOL,providers TEXT[] |
| MeUnverified (tanpa base) | id,email,name,email_verified_at=null,version |
| Project | name,description?,status,completed_at?,archived_at?,done_count INT,task_count INT,progress_percent NUMBER (0..100, satu desimal) |
| Task | project_id?,title,description?,status,priority,due_date?,completed_at?,archived_at?,recurrence_rule_id?,occurrence_date?,rule_version? |
| TaskEvent (tanpa base) | id,task_id,task_version,event_type,from_status?,to_status,previous_project_id?,project_id_at_event?,task_title_snapshot,project_name_snapshot?,archived,occurred_at |
| Dependency (tanpa base) | task_id,predecessor_id,predecessor_status,predecessor_title,created_at |
| Habit | name,start_date,timezone,archived_at?,archived_on?,current_schedule:HabitSchedule |
| HabitSchedule (tanpa base) | id,habit_id,effective_from,weekdays INT[],created_at |
| CheckIn (tanpa base) | id,habit_id,date,checked_at,created_at |
| PomodoroDay | cycle_date,timezone,next_phase,completed_focus_count |
| PomodoroState (tanpa base) | cycle_day_id,cycle_date,timezone,next_phase,completed_focus_count,version,updated_at |
| PomodoroSession | cycle_day_id,cycle_date,cycle_timezone,phase,status,planned_seconds,task_id?,project_id_at_start?,task_title_snapshot?,project_name_snapshot?,started_at,due_at?,ended_at?,active_duration_ms NUMBER,remaining_seconds INT |
| PomodoroInterval (tanpa base) | id,session_id,started_at,ended_at? |
| TimeboxEntry | kind,title,starts_at,ends_at,task_id?,habit_id?,status,cancelled_at? |
| FinanceAccount | name,type,opening_balance STRING,balance STRING,archived_at? |
| BalanceChange (tanpa base) | id,account_id,account_version,previous_balance STRING?,new_balance STRING,changed_at |
| Category | name,type,archived_at? |
| FinanceTransaction | type,status,account_id,to_account_id?,category_id?,amount STRING,date,note?,posted_at?,voided_at?,recurrence_rule_id?,occurrence_date?,rule_version? |
| TransactionRevision (tanpa base) | id,transaction_id,transaction_version,action,snapshot (exact keys SCHEMA),changed_at |
| Budget | category_id,month,limit_amount STRING,spent STRING,remaining STRING |
| TaskRule | title,description?,project_id?,priority,frequency,interval,start_date,end_date?,timezone,status,next_date?,last_generated_date?,processing_updated_at?,blocked_reason? |
| FinanceRule | type,account_id,to_account_id?,category_id?,amount STRING,note?,frequency,interval,start_date,end_date?,timezone,status,next_date?,last_generated_date?,processing_updated_at?,blocked_reason? |
| RuleRevision (tanpa base) | id,rule_id,rule_version,action,effective_after?,snapshot (exact keys SCHEMA),changed_at |

PomodoroBundle = {state:PomodoroState,today:PomodoroDay,session:PomodoroSession|null}; respons active dan mutasi Pomodoro menambah meta.server_now ISO UTC. Session detail menambah intervals:PomodoroInterval[]. remaining_seconds=ceil(max(0,planned_ms-active_duration_ms)/1000) untuk running/paused, 0 untuk completed/cancelled. Active_duration pada running memakai server_now dibatasi due_at; pause tidak menambahnya.

Current_schedule Habit adalah versi terakhir effective_from<=hari lokal habit; sebelum start_date gunakan jadwal awal berlabel belum dimulai. Budget.spent memakai bulan penuh sampai hari ini, bukan range parsial. Rule.blocked_reason null atau PROJECT_NOT_ACTIVE untuk aturan tugas aktif pada proyek nonaktif. PomodoroSession.cycle_date/cycle_timezone diambil dari Day terkait, bukan dihitung ulang dari profil.

## Pagination, tanggal, dan filter

Page default 1; page_size default 25, maksimal 100. Semua list terpaginasikan kecuali /me,/pomodoro/active,dan summary laporan. Default urutan created_at DESC,id DESC; history event occurred_at ASC,id ASC; revisi version ASC; jadwal effective_from ASC; interval started_at ASC. Task due_date ASC NULLS LAST,created_at DESC,id DESC; transaksi date DESC,created_at DESC,id DESC.

Project list hanya memakai status=active|completed|archived|all, default active; query archived ditolak. Task/Habit/FinanceAccount/Category memakai archived=false|true|all, default false. Rule list status=active|stopped|expired|all, default active; proyek terblokir tetap active. Tidak ada filter active boolean terpisah.

Task personal=true tidak boleh bersama project_id. overdue=true membatasi due_date<hari lokal,status!=done; kombinasi status=done ditolak. due_from/due_to harus berpasangan dan valid; bila keduanya serta overdue diberikan, hasil adalah irisan. Filter kategori/type transaksi harus cocok; to_account_id bukan filter list, account_id mencakup sumber/tujuan sekali.

Filter from/to harus berpasangan. Default list transaksi/sesi/check-in/event/occurrence adalah bulan berjalan sampai hari ini bila tidak dikirim; historical range boleh mencakup masa depan untuk list Task occurrence yang belum ada (hasil kosong), tetapi tidak untuk reports. Range yang dibatasi laporan/check-in maksimal 366 hari inklusif. Range query invalid 422, page di luar hasil mengembalikan [].

## Akun dan profil (REQ-01, REQ-17)

API custom menyediakan rute Google OAuth di bawah `/api/v1/auth/google/*` (start dan callback) melalui library OIDC standar; tidak ada `/api/auth/*` bawaan Auth.js. Versi library dikunci pada M0. Login Google versus penautan dibedakan oleh AuthLinkIntent satu kali yang terikat hash sid sesi reauth di server; callback tidak menerima user_id/provider identity sebagai bukti dari payload klien. Link yang gagal tidak berubah menjadi registrasi/login user baru. Smoke test M0 wajib memverifikasi integrasi intent dengan callback sebelum membangun modul lain.

| Method / path (relatif /api/v1) | Input | Hasil |
|---|---|---|
| POST /auth/register | name,email,password | 202 {accepted:true}; validasi sintaks tetap 422, email terpakai respons umum |
| POST /auth/verify-email | token | 200 {accepted:true}; sekali pakai, invalid/expired 422 |
| POST /auth/resend-verification | email | 202 {accepted:true}; invalidasi token lama |
| POST /auth/forgot-password | email | 202 {accepted:true}; Google-only diberi instruksi Google lewat email |
| POST /auth/reset-password | token,password | 200 {accepted:true}; cabut semua sesi |
| GET /me | tanpa body | MeVerified atau MeUnverified berdasarkan verifikasi |
| PATCH /me | version,name dan/atau timezone | MeVerified; email tidak dapat diubah |
| POST /auth/logout-all | sesi aktif, tanpa body | 200 {accepted:true}; cabut seluruh sesi termasuk sesi pemanggil dan hapus cookie; sesi belum verified diizinkan |
| POST /auth/password-setup/request | sesi verified+reauth | 202 {accepted:true}; Google-only |
| POST /auth/password-setup/confirm | sesi verified,token,password | 200 {accepted:true}; token terikat user dan cabut sesi lama |
| POST /auth/link/google | sesi verified+reauth | 200 {redirect_url}; Google verified email harus sama |
| DELETE /auth/link/google | sesi verified+reauth | 204; password aktif wajib |

MeUnverified tidak memberi akses settings bisnis/PATCH. Verify/resend/logout/CSRF publik atau preverified sebagaimana tabel. Reauth login ulang memakai metode yang sudah terhubung; session recent_auth_at server maksimal 10 menit. Token link intent memakai cookie HttpOnly pada path callback, disimpan sebagai hash, terikat sid sesi, dan hanya dapat dipakai sekali dalam 10 menit pada callback; pembuktian ini diimplementasikan dalam service server pada M0.

UI default Inggris; message API yang ditampilkan juga Inggris, dengan code stabil. Logout-all menaikkan User.session_version atomik, menghapus cookie sesi pemanggil, lalu UI menghapus cache dan menuju login. Label “Log out of all devices”; helper “You will also be logged out on this device. Log in again to continue.” Padanan Indonesia “Keluar dari semua perangkat”; pengguna harus login kembali pada semua perangkat.

## Proyek, tugas, dan kebiasaan (REQ-03, REQ-04, REQ-06, REQ-07)

| Endpoint (relatif /api/v1) | Input / filter | DTO |
|---|---|---|
| GET/POST /projects; GET/PATCH /projects/:id | create name,description?; patch version,name/description; list status | Project |
| POST /projects/:id/status | version,status; active membersihkan timestamp; blokir fokus/proyek sesuai PRD | Project |
| GET/POST /tasks; GET/PATCH /tasks/:id | create title,description?,project_id?,priority default medium,due_date?; patch version dan field sama; filter status,priority,project_id,personal,overdue,due_from/due_to,archived | Task |
| POST /tasks/:id/status | version,status; done diperiksa dependensi/Pomodoro | Task |
| POST /tasks/:id/archive; /tasks/:id/unarchive | version; arsip/pindah/done terblokir oleh fokus running/paused | Task |
| GET /tasks/:id/events | from/to,page/page_size; snapshot history tidak disaring arsip terkini | TaskEvent list |
| GET /tasks/:id/dependencies | page/page_size | Dependency list |
| PUT/DELETE /tasks/:id/dependencies/:predecessor_id | set idempotent; kedua tugas satu proyek aktif; successor done memerlukan predecessor done | Dependency / 204 |
| GET/POST /habits; GET/PATCH /habits/:id | create name,start_date,weekdays; patch version,name saja; start_date/timezone immutable; zona dari profil saat create; filter archived | Habit |
| GET/POST /habits/:id/schedules | create version Habit,weekdays,effective_from=besok lokal habit; tolak habit arsip | HabitSchedule list / Habit |
| POST /habits/:id/archive | version; simpan archived_at/archived_on sekali | Habit |
| GET /habits/:id/check-ins; PUT/DELETE /habits/:id/check-ins/:date | list from/to,page/page_size; tanggal valid menurut jadwal/start/arsip/hari lokal habit; PUT/DELETE idempotent | CheckIn list / CheckIn / 204 |

POST schedules menghasilkan 201 bila jadwal besok baru, 200 bila mengganti/no-op; versi Habit naik hanya pada perubahan nyata. GET schedules urut effective_from tanpa filter bulan sehingga jadwal awal tetap ditemukan. Semua mutasi Task nyata menghasilkan satu TaskEvent; no-op tidak menambah event. Project status/Task status sudah tercapai dengan version terkini tidak mengubah timestamp.

## Timebox di dashboard (REQ-18)

| Endpoint (relatif /api/v1) | Input / filter | Hasil |
|---|---|---|
| GET /timebox | date YYYY-MM-DD default hari ini; status planned/cancelled/all default planned; page/page_size | TimeboxEntry list, meta menambah date,timezone; urut starts_at ASC,id ASC |
| POST /timebox | kind,title,starts_at,ends_at,task_id?,habit_id?; Idempotency-Key | 201 TimeboxEntry; status dari server |
| GET /timebox/:id | tanpa body | TimeboxEntry |
| PATCH /timebox/:id | version dan field create yang diubah; validasi keadaan hasil | 200 TimeboxEntry; cancelled ditolak |
| POST /timebox/:id/cancel | version | 200 TimeboxEntry; cancelled ulang versi terkini no-op |

starts_at/ends_at wajib ISO UTC; UI mengonversi input zona profil. GET menghitung batas tanggal dalam zona profil saat request dan memilih blok yang beririsan, termasuk lintas tengah malam. Masa depan dan koreksi rencana lampau diperbolehkan. Overlap tidak menghasilkan 409; UI memberi penanda konflik dari irisan blok, dengan membaca seluruh halaman tanggal terkait. Kombinasi kind/FK, durasi focus, status, dan referensi mengikuti SCHEMA. Endpoint ini tidak memulai Pomodoro atau mengubah realisasi aktivitas. Dashboard tidak mempunyai DTO ringkasan keuangan.

## Pomodoro (REQ-05)

| Endpoint | Input | Hasil |
|---|---|---|
| GET /api/v1/pomodoro/active | tanpa body | PomodoroBundle + meta.server_now; tidak ada sesi berarti session=null |
| POST /api/v1/pomodoro/start | state_version,task_id opsional/null hanya untuk focus; Idempotency-Key | 201 PomodoroBundle; phase/duration dari next_phase/default server |
| POST /api/v1/pomodoro/sessions/:id/pause | version Session | 200 PomodoroBundle; paused ulang versi terkini no-op |
| POST /api/v1/pomodoro/sessions/:id/resume | version Session | 200 PomodoroBundle; running ulang versi terkini no-op |
| POST /api/v1/pomodoro/sessions/:id/cancel | version Session | 200 PomodoroBundle; cancelled ulang versi terkini no-op; completed ditolak |
| GET /api/v1/pomodoro/sessions | from/to,phase,status,task_id,project_id (snapshot),page/page_size | PomodoroSession list |
| GET /api/v1/pomodoro/sessions/:id | tanpa body | PomodoroSession + intervals |

Contoh sintetis GET active sebelum sesi pertama:

```json
{
  "data": {
    "state": {
      "cycle_day_id": "22222222-2222-4222-8222-222222222222",
      "cycle_date": "2026-09-15",
      "timezone": "Asia/Jakarta",
      "next_phase": "focus",
      "completed_focus_count": 0,
      "version": 2,
      "updated_at": "2026-09-15T03:00:00.000Z"
    },
    "today": {
      "id": "22222222-2222-4222-8222-222222222222",
      "cycle_date": "2026-09-15",
      "timezone": "Asia/Jakarta",
      "next_phase": "focus",
      "completed_focus_count": 0,
      "version": 1,
      "created_at": "2026-09-15T03:00:00.000Z",
      "updated_at": "2026-09-15T03:00:00.000Z"
    },
    "session": null
  },
  "meta": {
    "server_now": "2026-09-15T03:00:00.000Z"
  }
}
```

Tidak ada endpoint stop/complete/manual timestamp atau PATCH durasi. Completion hanya dari deadline server. Start saat ada running/paused memberi 409 POMODORO_ALREADY_ACTIVE; jika tidak ada sesi tetapi state_version usang, 409 VERSION_CONFLICT. Focus task_id hanya Task todo/in_progress tidak arsip pada proyek aktif. Break menerima task_id null atau tidak dikirim, menolak non-null.

Service merekonsiliasi deadline di bawah lock User sebelum membaca/mutasi/status Task/Project terkait. Deadline sudah lewat dapat menghasilkan Session completed dan versi baru, sehingga pause/cancel dengan versi lama memberi VERSION_CONFLICT dan klien refresh. No-op status yang diizinkan tetap memerlukan versi terkini. Worker/GET tidak memulai next_phase; POST start pengguna selalu diperlukan.

Contoh sintetis start fokus setelah GET state versi 2:

```http
POST /api/v1/pomodoro/start
Content-Type: application/json
Idempotency-Key: 11111111-1111-4111-8111-111111111111
X-CSRF-Token: example-csrf-token
```

```json
{
  "state_version": 2,
  "task_id": null
}
```

GET active memilih/membuat today berdasarkan tanggal lokal profil. Selama sesi lama terbuka, state menunjuk Day sesi dan today dapat menunjuk Day lain. Saat idle, state beralih ke today sebelum pemeriksaan state_version; rollover dapat menghasilkan VERSION_CONFLICT. State.cycle_date/timezone berasal dari Day terpilih. Fokus completed menambah Day saat start, bukan Day ended_at. Tanggal yang pernah dipakai menggunakan Day tersimpan; timezone Day immutable. Semua pemilihan/finalisasi/cache State di bawah lock User. GET tidak pernah memulai fase.

## Keuangan dan revisi (REQ-08 sampai REQ-11)

| Endpoint (relatif /api/v1) | Input / filter | DTO |
|---|---|---|
| GET/POST /finance/accounts; GET/PATCH /finance/accounts/:id | create name,type,opening_balance default "0"; patch version,name/type/opening_balance; archived | FinanceAccount |
| POST /finance/accounts/:id/archive | version; aturan aktif menghalangi | FinanceAccount |
| GET /finance/accounts/:id/balance-changes | page/page_size; seluruh riwayat, order account_version ASC | BalanceChange list |
| GET/POST /finance/categories; GET/PATCH /finance/categories/:id | create name,type; patch version,name saja; type immutable; filter type,archived | Category |
| POST /finance/categories/:id/archive | version; aturan aktif menghalangi | Category |
| GET/POST /finance/transactions; GET/PATCH /finance/transactions/:id | create type,account_id,to_account_id?,category_id?,amount,date,note?,status draft/posted default posted; patch version dan field domain selain status/recurrence; filter from/to,account_id,category_id,type,status | FinanceTransaction |
| POST /finance/transactions/:id/post | version,Idempotency-Key; refs aktif,date<=hari lokal | FinanceTransaction |
| POST /finance/transactions/:id/void | version; status void terminal | FinanceTransaction |
| GET /finance/transactions/:id/revisions | page/page_size; seluruh riwayat | TransactionRevision list |
| GET/POST /finance/budgets; GET/PATCH /finance/budgets/:id | create category_id,month hari pertama,limit_amount; patch version,limit_amount; list month default bulan ini | Budget |
| DELETE /finance/budgets/:id | If-Match:"N" version; tidak memakai body | 204 |

Income/expense kategori sesuai type, tujuan null. Transfer kategori null, dua akun berbeda satu pemilik. Draft tidak memengaruhi saldo/anggaran; void menyimpan sejarah; posted correction tetap posted dan menambah revision. Semua perubahan nominal/akun/tanggal diperiksa ulang. Akun/kategori arsip read-only kecuali void transaksi historis dan membaca revisions. Uang dan revision snapshot tidak keluar sebagai JS float.

## Pengulangan di Tasks dan Finance (REQ-12)

Endpoint berada di namespace modul pemilik; UI tidak menyediakan halaman/menu pengulangan mandiri. Rute statis tasks/recurrences harus didaftarkan sebelum tasks/:id.

| Endpoint (relatif /api/v1) | Input / filter | DTO |
|---|---|---|
| GET/POST /tasks/recurrences | list status; create title,description?,project_id?,priority default medium,frequency,interval default 1,start_date,end_date? | TaskRule |
| GET/PATCH /tasks/recurrences/:id | version,template title/description/project_id/priority,frequency/interval/end_date; start_date/timezone immutable; due_date bukan template | TaskRule |
| POST /tasks/recurrences/:id/stop | version | TaskRule |
| GET /tasks/recurrences/:id/occurrences | from/to,page/page_size; termasuk arsip | Task list |
| GET /tasks/recurrences/:id/revisions | page/page_size; seluruh versi | RuleRevision list |
| GET/POST /finance/recurrences | template type/account_id/to_account_id/category_id/amount/note + frequency,interval,start_date,end_date; tanpa status/date; list status | FinanceRule |
| GET/PATCH /finance/recurrences/:id | version,template uang,frequency/interval/end_date; start_date/timezone immutable | FinanceRule |
| POST /finance/recurrences/:id/stop | version | FinanceRule |
| GET /finance/recurrences/:id/occurrences | from/to,page/page_size; seluruh status transaksi | FinanceTransaction list |
| GET /finance/recurrences/:id/revisions | page/page_size; seluruh versi | RuleRevision list |

Create timezone dari profil; status active; revision v1. Worker dapat maju cursor/expiry tanpa menaikkan version. Edit/stop mengejar konfigurasi lama hingga cutoff di SCHEMA. >100 menghasilkan RECURRENCE_CATCHUP_PENDING tanpa perubahan; retry setelah backlog selesai tidak perlu versi baru hanya karena worker berjalan. Edit menghasilkan revision dan hanya occurrence berikutnya memakai rule_version baru.

Stopped/expired read-only; stop ulang versi terkini no-op. Proyek nonaktif memberi blocked_reason dan memblokir edit aturan tugas, tetapi stop boleh tanpa catch-up. Membuka proyek kembali menjalankan catch-up, bukan membuat fase Pomodoro. Transaksi berulang selalu draft; user post/cancel melalui endpoint transaksi.

## Laporan dan CSV pada modul sumber (REQ-13, REQ-14)

Tidak ada endpoint laporan global atau halaman/menu laporan/CSV mandiri. Kontrak relatif /api/v1:

| Endpoint | Konteks / hasil |
|---|---|
| GET /tasks/reports/summary; /tasks/reports/export | summary {range,tasks}; CSV tasks |
| GET /projects/:id/reports/summary; /projects/:id/reports/export | summary {range,tasks,pomodoro}; export section=tasks atau pomodoro wajib; filter ID proyek snapshot |
| GET /habits/reports/summary; /habits/reports/export | summary {range,habits}; CSV habits |
| GET /pomodoro/reports/summary; /pomodoro/reports/export | summary {range,pomodoro}; CSV pomodoro |
| GET /finance/reports/summary; /finance/reports/export | summary {range,finance,budgets}; export section=finance atau budgets wajib |

Semua endpoint menerima from/to opsional berpasangan; default bulan berjalan sampai hari ini, inklusif, maksimal 366 hari, tidak melewati hari lokal. Summary/export proyek harus memeriksa pemilik proyek, termasuk proyek completed/archived, dan memakai snapshot project_id untuk tasks serta pomodoro. Rute statis reports didaftarkan sebelum :id. Sebelum query yang melibatkan Pomodoro, rekonsiliasi deadline pengguna. DTO hanya memuat field milik konteks sesuai tabel, dengan shape berikut:

| Field data | Shape |
|---|---|
| range | {from,to,timezone} |
| tasks | {completed_count,distinct_task_count,per_project:[{project_id?,project_name_snapshot?,completed_count,distinct_task_count}]} |
| pomodoro | {focus_duration_ms,focus_duration_seconds,completed_focus_count,cancelled_focus_count,per_project:[{project_id?,project_name_snapshot?,focus_duration_ms,focus_duration_seconds}]} |
| habits | [{habit_id,name,timezone,scheduled_days,completed_days,ratio NUMBER or null}] |
| finance | {income STRING,expense STRING,net STRING,per_category:[{category_id,type,total STRING}],basis:"current_corrected_transactions"} |
| budgets | [{month,category_id,limit_amount STRING,spent STRING,remaining STRING,basis:"full_calendar_month"}] |

Task event menuju done dihitung per kejadian dan DISTINCT task_id; per_project berdasarkan snapshot project_id, bukan Task.project_id terkini. Jika proyek berganti nama dalam rentang, kelompok tetap menurut ID dan label memakai snapshot kejadian terakhir dalam rentang. Project null menggunakan label null. Snapshot pada baris sumber selalu dipertahankan.

Pomodoro time mengambil interval focus pada sesi terminal, di-overlap ke range; completed/cancelled counts mengambil ended_at dalam range, sehingga count dan duration adalah metrik berbeda. Hitungan laporan berdasarkan ended_at juga berbeda dari today.completed_focus_count yang berdasarkan Day sesi saat start; CSV Pomodoro menambah cycle_date/timezone untuk menjelaskan atribusi siklus. Per_project memakai ID snapshot dan label sesi terakhir dalam rentang. Semua sum milidetik dihitung dahulu, floor detik sekali per kelompok/total; sum angka detik per kelompok dapat berbeda satu detik dari total karena pembulatan, sehingga focus_duration_ms menjadi dasar rekonsiliasi.

Habit denominator memakai jadwal efektif, tanggal mulai dan archived_on pada zona tetap habit; from/to diperlakukan sebagai tanggal kalender literal pada masing-masing habit tanpa konversi DATE, termasuk hari tanpa check-in; ratio null bila denominator=0. Finance posted saja, transfer/draft/void/opening balance dikecualikan. Budget mencakup bulan yang beririsan dengan range; spent seluruh bulan sampai hari ini, bukan range parsial. Semua timestamp grouping mengikuti timezone saat request; DATE historis tidak dikonversi ulang.

Endpoint export masing-masing modul menghasilkan CSV UTF-8 attachment, filter/range/basis sama dengan summary, maksimum 10000 baris diperiksa sebelum body. Section dari modul tunggal ditentukan server; parameter section hanya diterima pada Projects dan Finance sesuai tabel endpoint. Kolom:

| Section | Kolom |
|---|---|
| tasks | event_id,task_id,task_title_snapshot,project_id_at_event,project_name_snapshot,occurred_at |
| pomodoro | interval_id,session_id,session_status,cycle_date,cycle_timezone,task_id,project_id_at_start,project_name_snapshot,interval_started_at,interval_ended_at,overlap_ms |
| habits | habit_id,name,timezone,date,scheduled,checked |
| finance | transaction_id,transaction_version,type,account_id,category_id,amount,date,note |
| budgets | month,category_id,limit_amount,spent,remaining |

CSV tasks satu baris per event done; Pomodoro satu baris per interval focus terminal ber-overlap. Untuk habits, satu baris per tanggal terjadwal, termasuk yang tidak checked; denominator/complete dapat direkonsiliasi dari kolom tersebut. Finance memakai baris current revision posted non-transfer. Escape quote/koma/newline RFC 4180; teks user yang dimulai formula (=,+,-,@ termasuk whitespace awal) diberi apostrof. Sanitasi kolom teks, bukan nominal uang. Export tidak mengunci laporan periode atau menyediakan backup lengkap.

## Koneksi dan retry (REQ-16)

Timeout bukan bukti gagal commit. Pertahankan input; retry creation/post memakai key/payload sama. Aksi berversi diperiksa dengan GET sebelum retry bila kondisi berubah. Offline tidak mengantrekan mutasi; countdown lokal bukan konfirmasi completed. Setelah reconnect, GET Pomodoro state/resource terbaru, baru tindakan pengguna. Logout/pergantian akun menghapus cache data pribadi.
