# 上线步骤：GitHub Pages + Supabase

> 先在本地跑通（框架 README 里的 5 分钟步骤），再做下面这些。账号类操作必须由你本人完成，我不能代办。

## 1. GitHub Pages（前端）

1. 在 GitHub 新建一个仓库（例如 `quiz-product`），把 `framework/frontend/` 里的文件推到仓库根目录（或 `frontend/` 子目录，视 Pages 设置而定）。
2. 仓库 Settings → Pages → Source 选 GitHub Actions（仓库里已有 `.github/workflows/deploy.yml`，推到 main 分支会自动部署）。
3. 部署成功后会得到一个 `https://<用户名>.github.io/<仓库名>/` 地址，先打开确认页面能加载。
4. 此时前端默认还是 `backend: 'local'`，密钥校验会连不上——这是正常的，做完第 2 步再改配置。

## 2. Supabase（后端：密钥 + 答题记录）

1. 在 Supabase 新建项目，记下 Project URL 和 anon key。
2. 在 Supabase Dashboard → SQL Editor 里执行 `backend/supabase/schema.sql` 整段（建表 + 开 RLS；不建 anon 的 policy，就是默认拒绝直接读表）。
3. 安装 Supabase CLI 并登录后，部署 Edge Function：
   ```bash
   supabase functions deploy validate-key
   ```
   函数代码在 `backend/supabase/functions/validate-key/index.ts`；`SUPABASE_URL` 和 `SUPABASE_SERVICE_ROLE_KEY` 由 Supabase 自动注入，不要写进代码、不要放进前端。
4. 生成密钥（在自己电脑上）：
   ```bash
   node tools/generate-keys.mjs --count 100 --batch 第一批
   ```
   按输出提示：先在 SQL Editor 里建一批次拿到 `batch_id`，再执行生成的 `tools/keys-第一批.sql`（只含哈希，没有明文密钥）。
5. 改前端配置 `frontend/config.js`：
   ```js
   backend: 'supabase',
   supabaseUrl: 'https://你的项目.supabase.co',
   supabaseAnonKey: '你的 anon key（公开 key，不是 service_role）',
   allowDemo: false,
   ```
   重新部署前端后，用一条真密钥完整走一遍：进入 → 答题 → 结果 → 再用同一密钥进入，应提示“已用过或不存在”。

## 3. 小红书店铺（卖货与发货）

- 店铺、实名、收款、虚拟商品上架与审核规则，按小红书官方规则由你本人办理；上架前在小红书 App 内复核关键词与审核要求。
- 未接通自动发货前：买家下单后，你手动把一条未用过的明文密钥发给买家；发过的密钥不要重复发。
- 密钥核销状态可在 Supabase Dashboard 里查：`select status, count(*) from access_keys where batch_id = '<batch_id>' group by status;`

## 4. 上线前检查清单

- [ ] 真密钥走完全流程一次，且同一密钥第二次进不去
- [ ] 返回上一题、进度条、结果页、分享卡都能正常用
- [ ] `content.json` 已换成正式主题内容（不是占位示例），免责声明在结果页可见
- [ ] `allowDemo` 已设为 false，演示密钥 DEMO-2026 在正式库里不存在
- [ ] service_role key 没有出现在任何前端文件、仓库或聊天记录里
- [ ] 明文密钥 CSV 没有提交到 GitHub
