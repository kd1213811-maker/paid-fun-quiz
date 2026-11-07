// Supabase Edge Function: validate-key
// 部署：supabase functions deploy validate-key
// 前端调用：POST /functions/v1/validate-key { code, redeemOnEntry }
// 行为：
//   - 把 code 算 SHA-256 哈希，去 access_keys 表里找
//   - 找不到 / 已用过 / 已作废 -> 返回 { ok:false, error }，不透露是哪一种细节以外的信息
//   - redeemOnEntry=true（默认，第一期视频的做法）：原子核销 status='unused' -> 'used'，并建一条 quiz_sessions 记录
//   - redeemOnEntry=false：只校验不核销，核销留到出结果时再调一次（需另加 redeem 端点，见 README）
// 环境变量：SUPABASE_URL、SUPABASE_SERVICE_ROLE_KEY（由 Supabase 自动注入，不要写进代码）
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { code, redeemOnEntry = true } = await req.json();
    if (!code || typeof code !== "string") {
      return Response.json({ ok: false, error: "密钥不对，请检查后重新输入。" }, { headers: cors });
    }
    const supabase = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
    const hash = await sha256Hex(code.trim().toUpperCase());

    if (!redeemOnEntry) {
      const { data } = await supabase.from("access_keys").select("id,status").eq("code_hash", hash).maybeSingle();
      if (!data || data.status !== "unused") {
        return Response.json({ ok: false, error: "这个密钥已用过或不存在。" }, { headers: cors });
      }
      return Response.json({ ok: true, sessionToken: "pending-" + data.id }, { headers: cors });
    }

    // 原子核销：只有 status='unused' 的行才会被更新，两个人同时用同一密钥只会有一个成功
    const sessionId = crypto.randomUUID();
    const { data, error } = await supabase
      .from("access_keys")
      .update({ status: "used", used_at: new Date().toISOString(), session_id: sessionId })
      .eq("code_hash", hash)
      .eq("status", "unused")
      .select("id")
      .maybeSingle();
    if (error || !data) {
      return Response.json({ ok: false, error: "这个密钥已用过或不存在。" }, { headers: cors });
    }
    await supabase.from("quiz_sessions").insert({ id: sessionId, key_id: data.id });
    return Response.json({ ok: true, sessionToken: sessionId }, { headers: cors });
  } catch (e) {
    return Response.json({ ok: false, error: "校验服务暂时不可用，请稍后再试。" }, { headers: cors, status: 500 });
  }
});
