# ERD Tracker

Versi 0.3. Tanggal: 16 September 2026. Status: model rancangan, belum menjadi database. Field lengkap dan constraint berada di [SCHEMA](SCHEMA.md). Diagram hanya menunjukkan field identitas/relasi utama; `user_id` dan metadata mengikuti konvensi skema.

## Identitas dan sistem

```mermaid
erDiagram
    User ||--o{ AuthAccount : memiliki
    User ||--o{ AuthToken : menerima
    User ||--o{ AuthLinkIntent : menautkan
    User ||--o{ IdempotencyRecord : mengirim
    User {
        uuid id PK
        string email UK
        string password_hash
        string timezone
        int session_version
    }
    AuthAccount {
        uuid id PK
        uuid user_id FK
        string provider
        string provider_account_id
    }
    AuthToken {
        uuid id PK
        uuid user_id FK
        string purpose
        string token_hash UK
    }
    AuthLinkIntent {
        uuid id PK
        uuid user_id FK
        string intent_hash UK
        string session_binding_hash
        datetime expires_at
    }
    IdempotencyRecord {
        uuid id PK
        uuid user_id FK
        string key
        string request_hash
    }
    EmailOutbox {
        uuid id PK
        string dedupe_key UK
        string payload_ciphertext
        string status
    }
    RateLimitBucket {
        string bucket_hash PK
        int count
        datetime expires_at
    }
```

EmailOutbox menggunakan recipient dan dedupe_key, tanpa FK pengguna agar pengiriman/cleanup tidak bergantung pada masa hidup token. RateLimitBucket merupakan tabel operasional. Tidak ada tabel sesi: sesi stateless memakai JWT dengan session_version pada User.

## Aktivitas, proyek, dan sejarah

```mermaid
erDiagram
    User ||--o{ Project : memiliki
    User ||--o{ Task : memiliki
    User ||--o{ TaskEvent : memiliki
    User ||--o{ Habit : memiliki
    Project o|--o{ Task : mengelompokkan
    Project o|--o{ TaskEvent : snapshot
    Task ||--|{ TaskEvent : merekam
    Task ||--o{ TaskDependency : successor
    Task ||--o{ TaskDependency : predecessor
    Habit ||--|{ HabitSchedule : jadwal
    Habit ||--o{ HabitCheckIn : dicentang
    User {
        uuid id PK
    }
    Project {
        uuid id PK
        uuid user_id FK
        string status
    }
    Task {
        uuid id PK
        uuid user_id FK
        uuid project_id FK
        string status
        int version
    }
    TaskEvent {
        uuid id PK
        uuid user_id FK
        uuid task_id FK
        uuid previous_project_id FK
        uuid project_id_at_event FK
        int task_version
        string event_type
        string to_status
        datetime occurred_at
    }
    TaskDependency {
        uuid task_id PK, FK
        uuid predecessor_id PK, FK
        uuid user_id FK
    }
    Habit {
        uuid id PK
        uuid user_id FK
        date start_date
        string timezone
        date archived_on
    }
    HabitSchedule {
        uuid id PK
        uuid habit_id FK
        date effective_from
    }
    HabitCheckIn {
        uuid id PK
        uuid habit_id FK
        date date
    }
```

TaskEvent dibuat bersama Task create dan tiap mutasi nyata. Laporan membaca event selesai/snapshot proyek, bukan status atau completed_at terkini. Snapshot previous_project_id juga menunjuk Project; relasinya tidak digambar ulang untuk menjaga keterbacaan. Habit wajib memiliki jadwal awal; archived_on disimpan sebagai batas historis tetap.

## Pomodoro

```mermaid
erDiagram
    User ||--|| PomodoroState : memiliki
    User ||--o{ PomodoroDay : siklus_harian
    PomodoroDay o|--o| PomodoroState : dipilih
    PomodoroDay ||--o{ PomodoroSession : mencatat
    User ||--o{ PomodoroSession : memiliki
    Task o|--o{ PomodoroSession : fokus
    Project o|--o{ PomodoroSession : snapshot
    PomodoroSession ||--|{ PomodoroInterval : berjalan
    User {
        uuid id PK
    }
    Task {
        uuid id PK
    }
    Project {
        uuid id PK
    }
    PomodoroDay {
        uuid id PK
        uuid user_id FK
        date cycle_date
        string timezone
        string next_phase
        int completed_focus_count
    }
    PomodoroState {
        uuid user_id PK, FK
        uuid cycle_day_id FK
        string next_phase
        int completed_focus_count
        int version
    }
    PomodoroSession {
        uuid id PK
        uuid user_id FK
        uuid cycle_day_id FK
        uuid task_id FK
        uuid project_id_at_start FK
        string phase
        string status
        int planned_seconds
        datetime due_at
        datetime ended_at
    }
    PomodoroInterval {
        uuid id PK
        uuid user_id FK
        uuid session_id FK
        datetime started_at
        datetime ended_at
    }
```

Satu sesi running/paused per pengguna, satu interval terbuka per sesi running. Pause menutup interval; resume menambah interval baru. Hanya focus memiliki referensi tugas/proyek; break tidak. Sesi terminal tetap tersimpan; hitungan fokus naik hanya sekali saat completed. State menunjuk Day, bukan sesi, sehingga tidak ada FK melingkar. Day unik per pengguna/tanggal dan menyimpan zona snapshot. Sesi lintas tengah malam tetap milik Day saat start; saat idle State beralih ke Day hari ini, memakai kembali Day yang sudah ada tanpa reset hitungan.

## Timebox — rencana dashboard

```mermaid
erDiagram
    User ||--o{ TimeboxEntry : merencanakan
    Task o|--o{ TimeboxEntry : ditautkan
    Habit o|--o{ TimeboxEntry : ditautkan
    User {
        uuid id PK
    }
    Task {
        uuid id PK
    }
    Habit {
        uuid id PK
    }
    TimeboxEntry {
        uuid id PK
        uuid user_id FK
        string kind
        string title
        datetime starts_at
        datetime ends_at
        uuid task_id FK
        uuid habit_id FK
        string status
        datetime cancelled_at
    }
```

Class tidak memiliki FK aktivitas; Task/Habit menaut sumber sesuai kind; Focus boleh menaut Task. Rencana tidak memiliki relasi eksekusi otomatis ke PomodoroSession. Pembatalan mempertahankan baris; overlap jadwal diizinkan.

## Keuangan dan revisi

```mermaid
erDiagram
    User ||--o{ FinanceAccount : memiliki
    User ||--o{ Category : memiliki
    User ||--o{ FinanceTransaction : memiliki
    User ||--o{ Budget : memiliki
    FinanceAccount ||--|{ FinanceAccountBalanceChange : saldo_awal
    FinanceAccount ||--o{ FinanceTransaction : sumber
    FinanceAccount o|--o{ FinanceTransaction : tujuan
    Category o|--o{ FinanceTransaction : kategori
    Category ||--o{ Budget : dibatasi
    FinanceTransaction ||--|{ FinanceTransactionRevision : merekam
    User {
        uuid id PK
    }
    FinanceAccount {
        uuid id PK
        uuid user_id FK
        bigint opening_balance
    }
    FinanceAccountBalanceChange {
        uuid id PK
        uuid account_id FK
        int account_version
        bigint previous_balance
        bigint new_balance
    }
    Category {
        uuid id PK
        uuid user_id FK
        string type
    }
    FinanceTransaction {
        uuid id PK
        uuid user_id FK
        uuid account_id FK
        uuid to_account_id FK
        uuid category_id FK
        bigint amount
        string status
        int version
    }
    FinanceTransactionRevision {
        uuid id PK
        uuid transaction_id FK
        int transaction_version
        string action
        json snapshot
    }
    Budget {
        uuid id PK
        uuid category_id FK
        date month
        bigint limit_amount
    }
```

Transfer memakai sumber/tujuan dan kategori null; income/expense kategori wajib, tujuan null. Setiap transaksi memiliki revisi awal; setiap akun memiliki catatan saldo awal pertama. Revisi tidak dihitung sebagai transaksi saldo. Laporan uang memakai baris terkoreksi saat ini dan dapat ditelusuri ke revisi.

## Pengulangan dan versi pembentuk

```mermaid
erDiagram
    User ||--o{ TaskRecurrenceRule : memiliki
    User ||--o{ FinanceRecurrenceRule : memiliki
    Project o|--o{ TaskRecurrenceRule : menjadwalkan
    FinanceAccount ||--o{ FinanceRecurrenceRule : sumber
    FinanceAccount o|--o{ FinanceRecurrenceRule : tujuan
    Category o|--o{ FinanceRecurrenceRule : kategori
    TaskRecurrenceRule ||--|{ TaskRecurrenceRevision : konfigurasi
    FinanceRecurrenceRule ||--|{ FinanceRecurrenceRevision : konfigurasi
    TaskRecurrenceRule o|--o{ Task : menghasilkan
    TaskRecurrenceRevision o|--o{ Task : versi_pembentuk
    FinanceRecurrenceRule o|--o{ FinanceTransaction : menghasilkan
    FinanceRecurrenceRevision o|--o{ FinanceTransaction : versi_pembentuk
    User {
        uuid id PK
    }
    Project {
        uuid id PK
    }
    FinanceAccount {
        uuid id PK
    }
    Category {
        uuid id PK
    }
    TaskRecurrenceRule {
        uuid id PK
        uuid user_id FK
        uuid project_id FK
        int version
        string status
        date next_date
    }
    FinanceRecurrenceRule {
        uuid id PK
        uuid user_id FK
        uuid account_id FK
        uuid to_account_id FK
        uuid category_id FK
        int version
        string status
        date next_date
    }
    TaskRecurrenceRevision {
        uuid id PK
        uuid rule_id FK
        int rule_version
        json snapshot
    }
    FinanceRecurrenceRevision {
        uuid id PK
        uuid rule_id FK
        int rule_version
        json snapshot
    }
    Task {
        uuid id PK
        uuid recurrence_rule_id FK
        date occurrence_date
        int rule_version FK
    }
    FinanceTransaction {
        uuid id PK
        uuid recurrence_rule_id FK
        date occurrence_date
        int rule_version FK
    }
```

Occurrence menyimpan rule_id/date/version; FK versi sebenarnya komposit sebagaimana SCHEMA. Worker maju cursor/expiry tanpa mengubah version konfigurasi. Rule stopped/expired dan revisinya tetap tersimpan. Tiga kolom occurrence baru ditambahkan di M4 setelah tabel aturan/revisi tersedia; data manual lama tetap null. Seluruh referensi bisnis satu pemilik, termasuk relasi User yang tidak digambar ulang.
