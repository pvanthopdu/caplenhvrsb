/**
 * Cấu hình PM2 chạy production cho hệ thống cấp lệnh VR-SB trên Ubuntu Server
 * Tên miền: http://caplenhvr-sb.online | Cổng nội bộ: 3008
 */
module.exports = {
  apps: [
    {
      name: 'caplenhvr-sb',
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
        PORT: 3008,
      },
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,
    },
  ],
};
