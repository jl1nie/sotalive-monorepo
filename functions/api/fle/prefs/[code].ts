// FLEonline の設定と予定の同期(Cloudflare KV)
//
//   GET    /api/fle/prefs/<同期コード>   → { updatedAt, data }(なければ 404)
//   PUT    /api/fle/prefs/<同期コード>   { base, data } → { updatedAt }
//                                       base は、クライアントが最後に見たサーバーの updatedAt(なければ 0)。
//                                       サーバーの updatedAt と違えば 409 と、サーバーの内容を返す(マージはクライアント)
//   DELETE /api/fle/prefs/<同期コード>   → 消す
//
// data = { settings, plans }。settings は端末をまたいで同じにする設定、plans は運用の予定(行き先)。
// 同期コードは、端末が作る長いランダムな文字列(推測できない)。アカウントはない。
// ログの本文は保存しない。KV の束縛名は FLE_PREFS(Pages の設定で束縛する)。

interface Env {
  FLE_PREFS?: KVNamespace;
}

const CODE = /^[A-Z2-7]{26}$/;
const MAX_BODY = 32 * 1024;
/** 使われなくなったものを消すまで(PUT のたびに延びる。クライアントは、月に1回は PUT する) */
const TTL_SECONDS = 400 * 24 * 60 * 60;
const MAX_RIGS = 20;
const MAX_PLANS = 60; // 消した予定(deleted)も数える
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const PLAN_ID = /^[A-Za-z0-9_-]{8,24}$/;

interface Stored {
  updatedAt: number;
  data: Doc;
}
interface Doc {
  settings: Record<string, unknown>;
  plans: Record<string, unknown>[];
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const text = (v: unknown, max: number) => typeof v === "string" && v.length <= max;
const textList = (v: unknown, count: number, max: number) =>
  Array.isArray(v) && v.length <= count && v.every((x) => text(x, max));

/** 設定の形を確かめて、知っている項目だけを残す。形が違えば null */
export function sanitizeSettings(data: unknown): Record<string, unknown> | null {
  if (!isObject(data)) return null;
  const out: Record<string, unknown> = {};
  if ("rigs" in data) {
    const rigs = data.rigs;
    if (!textList(rigs, MAX_RIGS, 60) || (rigs as string[]).some((r) => r === "" || r.includes("%"))) return null;
    out.rigs = rigs;
  }
  if ("timezone" in data) {
    const tz = data.timezone;
    if (!Number.isInteger(tz) || (tz as number) < -12 || (tz as number) > 14) return null;
    out.timezone = tz;
  }
  for (const key of ["writeBandMode", "writeRst", "hamlogJst"]) {
    if (key in data) {
      if (typeof data[key] !== "boolean") return null;
      out[key] = data[key];
    }
  }
  if ("language" in data) {
    if (data.language !== "auto" && data.language !== "ja" && data.language !== "en") return null;
    out.language = data.language;
  }
  return out;
}

/** 予定の形を確かめる。消した予定(deleted)は、id と時刻だけを残す。形が違えば null */
export function sanitizePlan(plan: unknown): Record<string, unknown> | null {
  if (!isObject(plan)) return null;
  if (typeof plan.id !== "string" || !PLAN_ID.test(plan.id)) return null;
  if (typeof plan.updatedAt !== "number" || !Number.isFinite(plan.updatedAt)) return null;
  if (plan.deleted === true) return { id: plan.id, updatedAt: plan.updatedAt, deleted: true };

  if (!text(plan.title, 60) || !text(plan.mycall, 20) || !text(plan.sota, 20) || !text(plan.wwff, 20)) return null;
  if (!text(plan.grid, 8) || !text(plan.rig, 60) || !text(plan.qslmsg, 200)) return null;
  if ((plan.rig as string).includes("%")) return null;
  if (typeof plan.date !== "string" || (plan.date !== "" && !DATE.test(plan.date))) return null;
  if (!textList(plan.pota, 6, 12)) return null;
  return {
    id: plan.id,
    updatedAt: plan.updatedAt,
    title: plan.title,
    date: plan.date,
    mycall: plan.mycall,
    sota: plan.sota,
    pota: plan.pota,
    wwff: plan.wwff,
    grid: plan.grid,
    rig: plan.rig,
    qslmsg: plan.qslmsg,
  };
}

/** 同期する内容の形を確かめて、知っている項目だけを残す。形が違えば null */
export function sanitize(data: unknown): Doc | null {
  if (!isObject(data)) return null;
  const settings = sanitizeSettings(data.settings ?? {});
  if (!settings) return null;
  if (!Array.isArray(data.plans) || data.plans.length > MAX_PLANS) return null;
  const plans: Record<string, unknown>[] = [];
  for (const p of data.plans) {
    const clean = sanitizePlan(p);
    if (!clean) return null;
    plans.push(clean);
  }
  return { settings, plans };
}

export const onRequest: PagesFunction<Env> = async ({ request, env, params }) => {
  const kv = env.FLE_PREFS;
  if (!kv) return json({ error: "sync is not configured" }, 503);

  const code = String(params.code ?? "");
  if (!CODE.test(code)) return json({ error: "invalid code" }, 400);
  const key = `prefs:${code}`;
  const stored = (await kv.get(key, "json")) as Stored | null;

  switch (request.method) {
    case "GET":
      return stored ? json(stored) : json({ error: "not found" }, 404);

    case "PUT": {
      const body = await request.text();
      if (body.length > MAX_BODY) return json({ error: "too large" }, 413);
      let parsed: { base?: unknown; data?: unknown };
      try {
        parsed = JSON.parse(body);
      } catch {
        return json({ error: "invalid json" }, 400);
      }
      const data = sanitize(parsed.data);
      if (!data || typeof parsed.base !== "number") return json({ error: "invalid data" }, 400);

      // クライアントが見た版と違う(別の端末が先に保存した)。マージは、クライアントがする
      if (stored && stored.updatedAt !== parsed.base) return json(stored, 409);

      const updatedAt = Math.max(Date.now(), (stored?.updatedAt ?? 0) + 1);
      await kv.put(key, JSON.stringify({ updatedAt, data } satisfies Stored), { expirationTtl: TTL_SECONDS });
      return json({ updatedAt });
    }

    case "DELETE":
      await kv.delete(key);
      return json({ ok: true });

    default:
      return json({ error: "method not allowed" }, 405);
  }
};
