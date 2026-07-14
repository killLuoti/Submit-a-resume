// PM2 进程管理配置
// 使用方法：pm2 start ecosystem.config.js
// 开机自启：pm2 startup && pm2 save

module.exports = {
  apps: [{
    name: 'job-helper',
    script: 'server.js',
    cwd: __dirname,

    // 进程数量：单实例即可（数据在本地 JSON 文件）
    instances: 1,
    exec_mode: 'fork',

    // 环境变量
    env: {
      NODE_ENV: 'production',
      PORT: 8787,
    },

    // 日志
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    merge_logs: true,
    max_size: '10M',
    retain: 5,

    // 自动重启策略
    max_restarts: 10,
    min_uptime: '10s',
    restart_delay: 3000,

    // 监听文件变化自动重启（生产环境可关闭）
    watch: false,
    ignore_watch: ['node_modules', 'data', 'logs'],
  }],
};
