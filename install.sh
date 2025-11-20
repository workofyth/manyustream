#!/bin/bash

set -e

echo "================================"
echo "   StreamFlow Quick Installer  "
echo "================================"
echo

read -p "Mulai instalasi? (y/n): " -n 1 -r
echo
[[ ! $REPLY =~ ^[Yy]$ ]] && echo "Instalasi dibatalkan." && exit 1

echo "🔄 Updating sistem..."
sudo apt update && sudo apt upgrade -y

echo "📦 Installing Node.js..."
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

echo "🎬 Installing FFmpeg dan Git..."
sudo apt install ffmpeg git -y

echo "📥 Clone repository..."
git clone https://github.com/workofyth/manyustream
cd manyustream

echo "⚙️ Installing dependencies..."
npm install
npm run generate-secret

echo "🕐 Setup timezone ke Asia/Jakarta..."
sudo timedatectl set-timezone Asia/Jakarta

echo "🔧 Setup firewall..."
sudo ufw allow ssh
sudo ufw allow 7575
sudo ufw --force enable

echo "🚀 Installing PM2..."
sudo npm install -g pm2

echo "▶️ Starting StreamFlow..."
pm2 start app.js --name streamflow
pm2 save

echo
echo "================================"
echo "✅ INSTALASI SELESAI!"
echo "================================"

SERVER_IP=$(curl -s ifconfig.me 2>/dev/null || echo "IP_SERVER")
echo
echo "🌐 URL Akses: http://$SERVER_IP:7575"
echo
echo "📋 Langkah selanjutnya:"
echo "1. Buka URL di browser"
echo "2. Buat username & password"
echo "3. Setelah membuat akun, lakukan Sign Out kemudian login kembali untuk sinkronisasi database"
echo "================================"
