# 付费趣味测评 · 框架（按第一期视频搭建）

> 基准路线：第一期视频的答题型付费测评。前端 GitHub Pages + 后端 Supabase + 一次性密钥。
> 主题、题目、结果**尚未确定**，当前 `frontend/content.json` 里的只是占位示例。正式内容确定后，只换那一个文件，不用改代码。
> 两个视频的完整记录见 `docs/video-notes.md`；照片路线（第二期）的预留方案见 `docs/photo-route-extension.md`。

## 目录

```
framework/
├── frontend/                 # 静态前端，可直接部署到 GitHub Pages
│   ├── index.html            # 首页 / 密钥入口 / 答题 / 结果页
│   ├── app.js                # 流程与计分逻辑（不含任何主题内容）
│   ├── styles.css
│   ├── config.js             # 只改这里：后端模式、地址、Supabase 配置
│   └── content.json          # ★ 主题、题目、计分、结果都在这里
├── backend/
│   ├── supabase/
│   │   ├── schema.sql        # 表结构 + RLS（密钥哈希、批次、答题记录）
│   │   └── functions/validate-key/index.ts   # Edge Function：原子核销密钥
│   └── local-server/server.mjs  # 本地演示后端，零依赖，不用账号就能跑通
├── tools/generate-keys.mjs   # 批量生成密钥（明文只显示一次，数据库只存哈希）
├── docs/
│   ├── video-notes.md        # 两个视频的记录（记好）
│   ├── deploy.md             # 上线步骤：GitHub Pages + Supabase
│   ├── content-guide.md      # 换主题时怎么改 content.json
│   └── photo-route-extension.md  # 第二期照片路线的预留接口
└── .github/workflows/deploy.yml  # 推到 GitHub 后自动部署到 Pages
```

## 5 分钟本地跑通（不用任何账号）

```bash
cd framework
node backend/local-server/server.mjs
# 打开 http://localhost:3000
# 演示密钥：DEMO-2026（用完一次后会记为已用；想再试，删掉 backend/local-server/data.json 再重启）
```

流程：输入密钥 → 答 5 道示例题（随时可点“返回上一题”修改）→ 出结果 → 复制分享文案 / 下载分享卡图片 → 重新测评需要新密钥。

也可以点“不用密钥，直接试流程（仅演示）”，只用来看页面流程，不走真密钥。正式上线前建议在 `config.js` 里把 `allowDemo` 设为 `false`。

## 换主题时只做一件事

改 `frontend/content.json`，格式见 `docs/content-guide.md`。不用改 `app.js`、`index.html`、后端代码。

- `meta`：标题、副标题、分享前缀、免责声明
- `questions`：题目与选项；每个选项可给一个或多个结果加分，也可给维度加分
- `results`：每个结果的标题、正文、学到的一点、可以试试、分享文案
- `scoring`：计分方式（目前为“出现次数最多者胜”）、平局规则（默认先看优先题，再按结果顺序）

## 密钥怎么卖、怎么发（第一期视频的做法）

1. 卖家在自己电脑上跑 `node tools/generate-keys.mjs --count 100 --batch 第一批`，得到明文 CSV（手动发货用）和只含哈希的 SQL。
2. 把哈希 SQL 在 Supabase 里执行，密钥入库；明文 CSV 不要提交到 GitHub。
3. 买家在小红书店铺下单后，卖家把一条明文密钥手动发给买家（未接通店铺自动发货前，只能手动发）。
4. 买家凭密钥进入，密钥进入即算用完，退出也算用完；重新测评需要新密钥。

## 哪些事我现在还做不了（需要你本人完成）

- 开 GitHub、Supabase、小红书店铺账号；实名认证、绑收款账号、备案 / 营业执照
- 把代码推到你自己的 GitHub 仓库并开启 Pages；把 Supabase 的 service_role key 配给 Edge Function（绝不能放进前端）
- 接通店铺支付 / 自动发货；没接通之前，密钥只能手动发
- 在小红书 App 内复核“冷门”关键词与虚拟产品上架规则；我不承诺销量或 10 万收入
