// 框架配置：只改这里，不改 app.js。
// backend: 'local' = 本地演示后端（backend/local-server/server.mjs），不用任何账号就能全流程跑通
//          'supabase' = 正式后端，见 backend/supabase/ 与 docs/deploy.md
//          'demo' = 纯前端演示，不校验真密钥（只用来看页面样式，正式上线不要用这个模式）
window.QUIZ_CONFIG = {
  backend: 'local',
  // 本地后端地址（用 server.mjs 启动后就是这个地址；部署到 GitHub Pages 时改成自己的后端地址）
  apiBase: 'http://localhost:3000',
  // Supabase 正式配置：填好后把 backend 改成 'supabase' 才能生效。
  // 这里只能放 anon key（公开 key），绝不能放 service_role key。
  supabaseUrl: '',
  supabaseAnonKey: '',
  // 是否显示“不用密钥，直接试流程（仅演示）”按钮。正式上线建议设为 false。
  allowDemo: true,
  // 密钥进入即算用完（第一期视频的做法）。设为 false 时，密钥在答完出结果时才算用完。
  redeemOnEntry: true
};
