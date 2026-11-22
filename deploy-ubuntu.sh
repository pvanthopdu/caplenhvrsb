#!/usr/bin/env bash
# ==============================================================================
# Script triển khai tự động mã nguồn mới từ Git lên Ubuntu Server
# Dự án  : Hệ thống Cấp phép rời cảng VR-SB (Lý Sơn - Quảng Ngãi)
# Repo   : https://github.com/pvanthopdu/caplenhvrsb.git
# Domain : http://caplenhvr-sb.online | PM2 Port: 3008
#
# Cách chạy:
#   chmod +x deploy-ubuntu.sh && ./deploy-ubuntu.sh
# Hoặc chỉ định thư mục tùy chỉnh:
#   APP_DIR=/var/www/caplenhvr-sb ./deploy-ubuntu.sh
# Giữ lại package.json cũ (không khuyến nghị nếu code mới thêm thư viện):
#   KEEP_OLD_PACKAGE_JSON=1 ./deploy-ubuntu.sh
# ==============================================================================

set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/pvanthopdu/caplenhvrsb.git}"
BRANCH="${BRANCH:-main}"
PM2_NAME="${PM2_NAME:-caplenhvr-sb}"
APP_PORT="${APP_PORT:-3008}"
APP_DOMAIN="${APP_DOMAIN:-http://caplenhvr-sb.online}"
KEEP_OLD_PACKAGE_JSON="${KEEP_OLD_PACKAGE_JSON:-0}"

# Tự động nhận diện thư mục dự án hiện tại nếu chạy trực tiếp từ thư mục ứng dụng
if [ -z "${APP_DIR:-}" ]; then
  SCRIPT_PATH="${BASH_SOURCE[0]:-}"
  SCRIPT_DIR=""
  if [ -n "$SCRIPT_PATH" ] && [ -f "$SCRIPT_PATH" ]; then
    SCRIPT_DIR="$(cd "$(dirname "$SCRIPT_PATH")" 2>/dev/null && pwd || true)"
  fi
  if [ -n "$SCRIPT_DIR" ] && [ -f "$SCRIPT_DIR/package.json" ] && [ "$SCRIPT_DIR" != "/tmp" ]; then
    APP_DIR="$SCRIPT_DIR"
  else
    APP_DIR="/var/www/caplenhvr-sb"
  fi
fi

TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP_DIR="/tmp/backup_caplenhvrsb_${TIMESTAMP}"
STAGING_DIR="/tmp/caplenhvrsb_staging_${TIMESTAMP}"

cleanup_on_error() {
  rm -rf "$STAGING_DIR" 2>/dev/null || true
}
trap cleanup_on_error ERR

echo "=================================================================="
echo "  TRIỂN KHAI TỰ ĐỘNG HỆ THỐNG CẤP PHÉP VR-SB (UBUNTU SERVER)"
echo "  - Thư mục đích : $APP_DIR"
echo "  - Git Repo     : $REPO_URL ($BRANCH)"
echo "  - PM2 App/Port : $PM2_NAME / $APP_PORT"
echo "=================================================================="

# 1. Kiểm tra công cụ & phiên bản Node.js tương thích
echo "[1/7] Kiểm tra tương thích hệ thống (git, node, npm, pm2)..."
if ! command -v git >/dev/null 2>&1; then
  echo "[LỖI] Chưa cài git. Chạy: sudo apt-get update && sudo apt-get install -y git"
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "[LỖI] Chưa cài Node.js. Cài Node 22 LTS bằng:"
  echo "  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt-get install -y nodejs"
  exit 1
fi

NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]")"
NODE_MINOR="$(node -p "process.versions.node.split('.')[1]")"
echo "  -> Đang dùng: Node $(node -v) | npm $(npm -v)"
if [ "$NODE_MAJOR" -lt 20 ] || { [ "$NODE_MAJOR" -eq 20 ] && [ "$NODE_MINOR" -lt 19 ]; }; then
  echo "[LỖI] Node $(node -v) chưa tương thích Vite 8 / React 19 (yêu cầu Node >= 20.19 hoặc 22 LTS)."
  echo "  Nâng cấp Node 22 LTS bằng:"
  echo "  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt-get install -y nodejs"
  exit 1
fi

if ! command -v pm2 >/dev/null 2>&1; then
  echo "  -> Chưa có PM2, đang cài đặt PM2 global..."
  npm install -g pm2
fi

# Chuyển sang /tmp để tránh lỗi mất thư mục làm việc khi xóa $APP_DIR
cd /tmp

# 2. Sao lưu cấu hình môi trường & dữ liệu hiện có
echo "[2/7] Sao lưu .env, cấu hình Firebase và thư mục dữ liệu (nếu có)..."
mkdir -p "$BACKUP_DIR"
if [ -d "$APP_DIR" ]; then
  for file_name in .env firebase-applet-config.json package.json package-lock.json ecosystem.config.cjs; do
    if [ -f "$APP_DIR/$file_name" ]; then
      cp -a "$APP_DIR/$file_name" "$BACKUP_DIR/$file_name"
    fi
  done
  for dir_name in data uploads storage; do
    if [ -d "$APP_DIR/$dir_name" ]; then
      cp -a "$APP_DIR/$dir_name" "$BACKUP_DIR/$dir_name"
    fi
  done
  echo "  -> Đã sao lưu tại: $BACKUP_DIR"
else
  echo "  -> Cài đặt mới lần đầu (chưa có thư mục $APP_DIR)."
fi

# 3. Clone mã nguồn mới ra thư mục tạm trước (nếu lỗi mạng/Git vẫn giữ nguyên bản đang chạy)
echo "[3/7] Tải sạch mã nguồn mới từ Git..."
rm -rf "$STAGING_DIR"
if ! git clone --depth 1 --branch "$BRANCH" "$REPO_URL" "$STAGING_DIR" 2>/dev/null; then
  git clone --depth 1 "$REPO_URL" "$STAGING_DIR"
fi

# 4. Dừng PM2, xóa sạch mã nguồn cũ và thay bằng mã nguồn mới
echo "[4/7] Dừng PM2, xóa mã nguồn cũ và triển khai mã nguồn mới..."
pm2 delete "$PM2_NAME" 2>/dev/null || true
rm -rf "$APP_DIR"
mkdir -p "$(dirname "$APP_DIR")"
mv "$STAGING_DIR" "$APP_DIR"
cd "$APP_DIR"
chmod +x "$APP_DIR/deploy-ubuntu.sh" 2>/dev/null || true

# 5. Khôi phục .env, Firebase config, dữ liệu hồ sơ và đồng bộ cổng 3008
echo "[5/7] Khôi phục cấu hình môi trường & dữ liệu..."
if [ -f "$BACKUP_DIR/.env" ]; then
  cp -f "$BACKUP_DIR/.env" "$APP_DIR/.env"
  echo "  -> Đã giữ nguyên file .env cũ."
else
  cat <<ENVEOF > "$APP_DIR/.env"
NODE_ENV=production
PORT=$APP_PORT
APP_URL=$APP_DOMAIN
GEMINI_API_KEY=
DOSSIER_STORAGE_DIR=data/ho-so-chuyen
ENVEOF
  echo "  -> Tạo mới file .env mặc định tại $APP_DIR/.env."
fi

# Đảm bảo PORT trong .env khớp APP_PORT (mặc định 3008)
if grep -q '^PORT=' "$APP_DIR/.env"; then
  sed -i "s/^PORT=.*/PORT=$APP_PORT/" "$APP_DIR/.env"
else
  echo "PORT=$APP_PORT" >> "$APP_DIR/.env"
fi

if [ "$KEEP_OLD_PACKAGE_JSON" = "1" ] && [ -f "$BACKUP_DIR/package.json" ]; then
  cp -f "$BACKUP_DIR/package.json" "$APP_DIR/package.json"
  [ -f "$BACKUP_DIR/package-lock.json" ] && cp -f "$BACKUP_DIR/package-lock.json" "$APP_DIR/package-lock.json"
  echo "  -> Đã giữ nguyên package.json cũ theo biến KEEP_OLD_PACKAGE_JSON=1."
fi

if [ -f "$BACKUP_DIR/firebase-applet-config.json" ]; then
  cp -f "$BACKUP_DIR/firebase-applet-config.json" "$APP_DIR/firebase-applet-config.json"
fi

for dir_name in data uploads storage; do
  if [ -d "$BACKUP_DIR/$dir_name" ]; then
    rm -rf "$APP_DIR/$dir_name"
    cp -a "$BACKUP_DIR/$dir_name" "$APP_DIR/$dir_name"
  fi
done

mkdir -p "$APP_DIR/logs" "$APP_DIR/data/ho-so-chuyen"

# Đảm bảo tồn tại ecosystem.config.cjs chạy chuẩn cổng 3008
if [ ! -f "$APP_DIR/ecosystem.config.cjs" ]; then
  cat <<PM2EOF > "$APP_DIR/ecosystem.config.cjs"
module.exports = {
  apps: [
    {
      name: '${PM2_NAME}',
      script: './node_modules/.bin/tsx',
      args: 'server.ts',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '700M',
      env: {
        NODE_ENV: 'production',
        PORT: ${APP_PORT},
      },
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,
    },
  ],
};
PM2EOF
fi

# 6. Cài mới toàn bộ dependencies và build production
echo "[6/7] Cài đặt dependencies và build bản production..."
rm -rf node_modules dist
npm install --no-audit --no-fund
npm run build

# 7. Khởi động PM2, lưu cấu hình & kiểm tra kết nối
echo "[7/7] Khởi chạy PM2 ($PM2_NAME) và kiểm tra kết nối nội bộ..."
pm2 start ecosystem.config.cjs
pm2 save

sleep 3
pm2 status

if command -v curl >/dev/null 2>&1; then
  echo "  -> Kiểm tra HTTP http://127.0.0.1:${APP_PORT}:"
  curl -fsSI "http://127.0.0.1:${APP_PORT}" | head -n 5 || true
fi

if command -v nginx >/dev/null 2>&1; then
  if sudo -n nginx -t >/dev/null 2>&1; then
    sudo -n systemctl reload nginx || true
    echo "  -> Đã reload Nginx thành công."
  fi
fi

echo "=================================================================="
echo "  HOÀN TẤT TRIỂN KHAI!"
echo "  - Ứng dụng đang chạy tại : http://127.0.0.1:${APP_PORT}"
echo "  - Tên miền               : ${APP_DOMAIN}"
echo "  - Bản sao lưu an toàn    : ${BACKUP_DIR}"
echo "  - Xem log trực tiếp      : pm2 logs ${PM2_NAME}"
echo "=================================================================="
