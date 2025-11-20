![logo](https://github.com/user-attachments/assets/50231124-d546-43cb-9cf4-7a06a1dad5bd)

# StreamFlow v2.0 🚀

StreamFlow adalah aplikasi live streaming yang memungkinkan kamu melakukan live streaming ke berbagai platform seperti YouTube, Facebook, dan platform lainnya menggunakan protokol RTMP. Aplikasi ini dapat berjalan di VPS (Virtual Private Server) dan mendukung streaming ke banyak platform secara bersamaan.

## 🎯 New Features in v2.0

### 1. **Multi-Channel Streaming**
- Stream ke multiple YouTube channels, Facebook, Twitch, dan platform lain secara bersamaan
- Manage unlimited streaming destinations per user
- Interface management channel yang mudah

### 2. **Recurring Scheduled Streams**
- **Daily**: Stream otomatis setiap hari pada waktu tertentu
- **Weekly**: Stream pada hari tertentu setiap minggu
- **Monthly**: Stream pada tanggal tertentu setiap bulan
- Powered by BullMQ job queue untuk reliability

### 3. **MinIO Object Storage**
- Scalable video storage dengan MinIO
- Distributed storage support
- Production-ready architecture

### 4. **PostgreSQL Database**
- Migrated dari SQLite ke PostgreSQL
- Better performance dan concurrent connections
- Enterprise-grade reliability

## ✨ Fitur Utama

- **Multi-Channel Streaming** - Streaming ke multiple channels dari berbagai platform secara bersamaan
- **Recurring Schedule** - Jadwalkan streaming berulang harian, mingguan, atau bulanan
- **Video Gallery** - Kelola koleksi video dengan antarmuka yang intuitif
- **Upload Video** - Upload dari local storage atau import langsung dari Google Drive
- **Scheduled Streaming** - Jadwalkan streaming dengan pengaturan waktu yang fleksibel
- **Advanced Settings** - Kontrol penuh untuk bitrate, resolusi, FPS, dan orientasi video
- **Real-time Monitoring** - Monitor status streaming dengan dashboard real-time
- **Video Analytics** - Pantau statistik dan performa video langsung dari aplikasi
- **Responsive UI** - Antarmuka modern yang responsif di semua perangkat

## 🛠️ System Requirements

- **Docker & Docker Compose** (Recommended)
- **Node.js** v16+ (untuk development lokal)
- **FFmpeg** untuk video processing (included in Docker)
- **PostgreSQL** (included in docker-compose)
- **Redis** (included in docker-compose)
- **MinIO** (included in docker-compose)
- **VPS/Server** dengan minimal 2 Core CPU & 2GB RAM
- **Port** 7575, 5432, 6379, 9000, 9001 (dapat disesuaikan)


