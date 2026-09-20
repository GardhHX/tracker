# DESIGN.md — Arah visual Tracker

Status: arah desain untuk landing page dan UI akun. Disusun dari referensi nyata (Mobbin) atas permintaan pemilik produk, dipakai sebagai sumber identitas; `antislop.md` bekerja sebagai filter di atasnya.

## Design Read

Reading this as: landing + auth untuk **individu** yang mengelola aktivitas, keuangan, dan proyek pribadi (konteks Indonesia, IDR, Asia/Jakarta), dalam bahasa visual **"buku kas yang tenang" (quiet ledger)** — editorial, hangat, dewasa.

**Dial: ENERGY 2 / RHYTHM 2 / MOTION 1.**

- ENERGY 2 — percaya diri tapi tidak berteriak; tipografi yang bicara, bukan warna yang menyala.
- RHYTHM 2 — konsisten dengan beberapa variasi; tiap section punya komposisi berbeda, bukan grid kartu yang sama berulang.
- MOTION 1 — utamanya hover dan transisi. Satu fade lembut sekali jalan saat elemen pertama terlihat. **Tidak ada** animasi loop (float, pulse, bounce) yang berjalan terus.

## Referensi (Mobbin)

Identitas diturunkan dari, bukan meniru:

- [Origin](https://mobbin.com/screens/87cb0cdc-d3c2-42ca-809e-a60d93973fa2) — judung recap dengan **serif editorial** di antara UI sans yang bersih; nuansa personal dan tenang.
- [Monarch](https://mobbin.com/screens/04aec94e-1f28-43d8-a974-be85ffe629d4) — netral hangat dengan **satu aksen hijau** untuk uang; angka rapi, tanpa hiasan.
- [Copilot Money](https://mobbin.com/screens/4e13cc80-a9e1-48b0-8882-c8857758acc5) — garis hijau tipis, banyak ruang kosong, hierarki jelas.

Bukan referensi untuk ditiru bentuknya (R-30): tidak mengklon satu produk pun. Yang diambil hanya *sifat* — editorial serif, netral hangat, satu aksen hijau.

## Palet (2 core + 1 aksen; netral tidak dihitung — R-29)

Semua pasangan teks/latar sudah lolos WCAG AA (diverifikasi, R-25).

### Terang (default: "kertas")
| Token | Hex | Catatan |
|---|---|---|
| `--paper` (bg) | `#F7F4ED` | putih gading hangat, bukan putih steril |
| `--surface` | `#FFFFFF` | kartu/panel |
| `--surface-2` | `#FBF8F2` | blok halus |
| `--ink` (judul/teks) | `#1B1A16` | 15.85:1 di paper |
| `--ink-soft` | `#3D3B34` | teks sekunder |
| `--muted` | `#6A675C` | 5.16:1 di paper |
| `--line` | `#E5E0D4` | garis/border |
| `--accent` (teks/link hijau) | `#146A46` | 6.01:1 di paper |
| `--accent-solid` (tombol) | `#17724C` | teks putih 5.92:1 |
| `--accent-wash` | `#E7EFE8` | latar tint hijau sangat tipis |

### Gelap (toggle: "malam")
Ada karena pengguna berhak memilih tema (R-21), bukan karena "dark = tech". Kedua tema wajib berfungsi penuh (R-34).
| Token | Hex | Catatan |
|---|---|---|
| `--paper` (bg) | `#14130F` | arang hangat |
| `--surface` | `#1C1B16` | |
| `--surface-2` | `#232219` | |
| `--ink` | `#F2EEE4` | 16.04:1 |
| `--ink-soft` | `#D6D2C6` | |
| `--muted` | `#A29E90` | 6.93:1 |
| `--line` | `#302E26` | |
| `--accent` | `#5FBE8E` | 8.18:1 |
| `--accent-solid` | `#3DBB86` | teks ink `#0E1A12` 7.36:1 |
| `--accent-wash` | `#1B241E` | |

Aksen hijau dipakai **hanya di momen kunci** (R-01, core Part 3): tombol utama, satu angka/garis penting, tautan. Bukan di setiap ikon, badge, dan border.

## Tipografi (dipilih karena alasan — R-06)

- **Display: Fraunces** (serif). Alasan: serif hangat berkarakter yang membangun kesan "buku catatan pribadi yang dipikirkan", membedakan produk dari tampilan sans default AI. Dipakai untuk h1/h2, judul section, dan angka besar sebagai aksen editorial.
- **UI/teks: Inter**. Alasan: angka **tabular** untuk nominal Rupiah dan tabel keuangan yang rapat, keterbacaan tinggi di ukuran kecil, cakupan Latin/Indonesia lengkap.

Tidak ada monospace-sebagai-estetika, tidak ada UPPERCASE dengan tracking lebar.

## Bentuk & dekorasi

- **Radius**: kecil–sedang, dipakai berjenjang (R-11). Kartu `14px`, tombol `10px`, input `12px`, pill hanya untuk chip status kecil. Bukan semua serba pill.
- **Bayangan**: penanda elevasi saja (R-12). Datar sebagai dasar; hanya panel/preview produk yang benar-benar mengambang.
- **DILARANG** pada redesign ini: gradien indigo→ungu sebagai warna utama, latar grid/blueprint, glow bertumpuk, glassmorphism di banyak permukaan, badge kapsul dekoratif, titik status yang berpendar/berdenyut, dan animasi loop tanpa henti.
- **Ikon**: garis relevan (tugas, dompet, kalender, grafik). Tanpa sparkle/petir/robot/orb.

## Motif identitas

Satu motif berulang: **angka besar bergaya editorial (Fraunces) + garis tipis** sebagai penanda urutan/hierarki (modul, langkah, statistik contoh). Ini "suara" tipografis produk, bukan hiasan.

## Bahasa dan cakupan produk

Keputusan produk per 16 September 2026 mengikuti PRD 0.3: default UI Inggris, Timebox di dashboard, siklus Pomodoro harian, dashboard tanpa rincian keuangan. Pengulangan serta laporan/CSV berada dalam modul sumber dan tidak mempunyai menu mandiri. Label semua sesi adalah “Log out of all devices”; penjelasan menyatakan perangkat aktif ikut keluar dan pengguna harus login kembali. Padanan Indonesia: “Keluar dari semua perangkat”. Identitas visual di dokumen ini tetap berlaku.

## Konten jujur (R-17, R-18, R-36, R-38)

- Angka pada preview diberi label **"Sample data"** (data sintetis), tidak disajikan sebagai fakta.
- Tidak ada logo "trusted by" palsu, testimoni fiktif, atau klaim keamanan yang dibuat-buat.
- Nav hanya menaut ke section/rute yang benar-benar ada (R-24). Form auth adalah UI pratinjau yang jujur berlabel, belum terhubung server.
