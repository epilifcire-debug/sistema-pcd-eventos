// =====================================================================
// Edge Function: google-drive
// Documentos dos cadastros PCD no Google Drive.
//   Drive/Documentos PcD/<Nome do cadastro>/<arquivos>
// Ações (POST JSON): auth_url, disconnect, download, remover, listar
// Upload (POST multipart/form-data): pessoa_id, nome, cpf, pasta_id?, arquivos[]
// Retorno do Google (GET ?code=...&state=...)
// Secrets necessários: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, APP_URL
// =====================================================================
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-api-version, x-region",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Expose-Headers": "content-disposition, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID") ?? "";
const CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET") ?? "";
const APP_URL = (Deno.env.get("APP_URL") ?? "").replace(/\/$/, "");
const REDIRECT = `${SUPABASE_URL}/functions/v1/google-drive`;
const RAIZ = "Documentos PcD";
const PASTA = "application/vnd.google-apps.folder";
const API = "https://www.googleapis.com/drive/v3";

const db = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } });

// ---------------------------------------------------------------- Google
async function tokenDeAcesso(refresh: string) {
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, refresh_token: refresh, grant_type: "refresh_token" }),
  });
  const d = await r.json();
  if (!r.ok) {
    if (d.error === "invalid_grant") throw new Error("A conexão com o Google expirou. Reconecte em Configurações.");
    throw new Error("Google: " + (d.error_description || d.error));
  }
  return d.access_token as string;
}

async function g(token: string, url: string, init: RequestInit = {}) {
  const r = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.headers || {}) } });
  if (!r.ok) {
    const t = await r.text();
    const e = new Error(`Drive ${r.status}: ${t.slice(0, 300)}`) as Error & { status?: number };
    e.status = r.status;
    throw e;
  }
  return r;
}

const aspas = (s: string) => s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

async function buscar(token: string, q: string) {
  const u = `${API}/files?q=${encodeURIComponent(q)}&fields=files(id,name,appProperties)&pageSize=50`;
  const d = await (await g(token, u)).json();
  return (d.files || []) as { id: string; name: string; appProperties?: Record<string, string> }[];
}

async function existe(token: string, id: string) {
  try {
    const d = await (await g(token, `${API}/files/${id}?fields=id,name,trashed`)).json();
    return d.trashed ? null : d;
  } catch (e) {
    if ((e as { status?: number }).status === 404) return null;
    throw e;
  }
}

async function criarPasta(token: string, nome: string, pai: string | null, props?: Record<string, string>) {
  const meta: Record<string, unknown> = { name: nome, mimeType: PASTA };
  if (pai) meta.parents = [pai];
  if (props) meta.appProperties = props;
  return (await (await g(token, `${API}/files?fields=id,name`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(meta),
  })).json()).id as string;
}

// Pasta "Documentos PcD" (procura; se não houver, cria)
async function garantirRaiz(token: string, cfg: { root_folder_id?: string | null }) {
  if (cfg.root_folder_id && (await existe(token, cfg.root_folder_id))) return cfg.root_folder_id;
  const achadas = await buscar(token, `name = '${aspas(RAIZ)}' and mimeType = '${PASTA}' and trashed = false`);
  const id = achadas[0]?.id || (await criarPasta(token, RAIZ, null));
  await db.from("google_config").update({ root_folder_id: id }).eq("id", 1);
  return id;
}

// Pasta do cadastro: 1) a já vinculada  2) a marcada com o id da pessoa  3) a com o mesmo nome  4) cria
async function garantirPastaPessoa(token: string, raiz: string, p: { pessoa_id: string; nome: string; pasta_id?: string }) {
  const nome = p.nome.trim() || "Sem nome";

  if (p.pasta_id) {
    const f = await existe(token, p.pasta_id);
    if (f) {
      if (f.name !== nome) {
        await g(token, `${API}/files/${f.id}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: nome }),
        });
      }
      return f.id as string;
    }
  }

  const porId = await buscar(token,
    `appProperties has { key='pessoa_id' and value='${aspas(p.pessoa_id)}' } and mimeType = '${PASTA}' and trashed = false`);
  if (porId[0]) return porId[0].id;

  const porNome = await buscar(token,
    `name = '${aspas(nome)}' and '${raiz}' in parents and mimeType = '${PASTA}' and trashed = false`);
  const livre = porNome.find((f) => !f.appProperties?.pessoa_id || f.appProperties.pessoa_id === p.pessoa_id);
  if (livre) {
    await g(token, `${API}/files/${livre.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appProperties: { pessoa_id: p.pessoa_id } }),
    });
    return livre.id;
  }

  return await criarPasta(token, nome, raiz, { pessoa_id: p.pessoa_id });
}

async function enviarArquivo(token: string, pasta: string, arquivo: File) {
  const meta = JSON.stringify({ name: arquivo.name, parents: [pasta] });
  const b = "pcd" + crypto.randomUUID().replace(/-/g, "");
  const corpo = new Blob([
    `--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n`,
    `--${b}\r\nContent-Type: ${arquivo.type || "application/octet-stream"}\r\n\r\n`,
    new Uint8Array(await arquivo.arrayBuffer()),
    `\r\n--${b}--`,
  ]);
  const d = await (await g(token,
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,size", {
      method: "POST", headers: { "Content-Type": `multipart/related; boundary=${b}` }, body: corpo,
    })).json();
  return { drive_id: d.id, nome: d.name, mime: d.mimeType, tamanho: Number(d.size || 0) };
}

// ---------------------------------------------------------------- Supabase
async function quemChama(req: Request) {
  const token = (req.headers.get("Authorization") || "").replace("Bearer ", "");
  if (!token) return null;
  const { data } = await db.auth.getUser(token);
  if (!data?.user) return null;
  const { data: perfil } = await db.from("profiles").select("*").eq("id", data.user.id).single();
  return perfil && perfil.ativo ? perfil : null;
}

async function config() {
  const { data } = await db.from("google_config").select("*").eq("id", 1).maybeSingle();
  if (!data?.refresh_token) throw new Error("Google Drive não conectado. Peça ao administrador para conectar em Configurações.");
  return data;
}

const voltar = (status: string) =>
  new Response(null, { status: 302, headers: { Location: `${APP_URL}/#Configuracoes?google=${status}` } });

// ---------------------------------------------------------------- Rotas
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const url = new URL(req.url);

  // Retorno do login do Google
  if (req.method === "GET") {
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    if (url.searchParams.get("error") || !code || !state) return voltar("cancelado");
    try {
      const { data: st } = await db.from("google_oauth_state").select("*").eq("state", state).maybeSingle();
      await db.from("google_oauth_state").delete().eq("state", state);
      if (!st || new Date(st.expira_em) < new Date()) return voltar("expirado");

      const r = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ code, client_id: CLIENT_ID, client_secret: CLIENT_SECRET, redirect_uri: REDIRECT, grant_type: "authorization_code" }),
      });
      const tk = await r.json();
      if (!r.ok || !tk.refresh_token) return voltar("erro");

      const eu = await (await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${tk.access_token}` },
      })).json();

      await db.from("google_config").upsert({
        id: 1, email: eu.email, refresh_token: tk.refresh_token, root_folder_id: null,
        conectado_em: new Date().toISOString(), conectado_por: st.user_id,
      });
      await garantirRaiz(tk.access_token, {});
      return voltar("ok");
    } catch (_e) {
      return voltar("erro");
    }
  }

  try {
    const eu = await quemChama(req);
    if (!eu) return json({ error: "não autenticado" }, 401);
    const staff = ["admin", "user"].includes(eu.role);

    // Upload de documentos
    if ((req.headers.get("content-type") || "").includes("multipart/form-data")) {
      if (!staff) return json({ error: "sem permissão" }, 403);
      const fd = await req.formData();
      const pessoa_id = String(fd.get("pessoa_id") || "");
      const nome = String(fd.get("nome") || "");
      const pasta_id = String(fd.get("pasta_id") || "") || undefined;
      const arquivos = fd.getAll("arquivos").filter((a) => a instanceof File) as File[];
      if (!pessoa_id || !nome) return json({ error: "cadastro sem id ou nome" }, 400);

      const cfg = await config();
      const token = await tokenDeAcesso(cfg.refresh_token);
      const raiz = await garantirRaiz(token, cfg);
      const pasta = await garantirPastaPessoa(token, raiz, { pessoa_id, nome, pasta_id });
      const enviados = [];
      for (const a of arquivos) enviados.push(await enviarArquivo(token, pasta, a));
      return json({ pasta_id: pasta, arquivos: enviados });
    }

    const body = await req.json();

    if (body.action === "auth_url") {
      if (eu.role !== "admin") return json({ error: "somente admin conecta o Google Drive" }, 403);
      if (!CLIENT_ID || !CLIENT_SECRET || !APP_URL) return json({ error: "faltam os secrets GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET e APP_URL" }, 400);
      const state = crypto.randomUUID();
      await db.from("google_oauth_state").insert({ state, user_id: eu.id });
      const p = new URLSearchParams({
        client_id: CLIENT_ID, redirect_uri: REDIRECT, response_type: "code", access_type: "offline", prompt: "consent",
        scope: "https://www.googleapis.com/auth/drive.file openid email", state,
        login_hint: body.email || "",
      });
      return json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${p}` });
    }

    if (body.action === "disconnect") {
      if (eu.role !== "admin") return json({ error: "somente admin" }, 403);
      const { data } = await db.from("google_config").select("refresh_token").eq("id", 1).maybeSingle();
      if (data?.refresh_token) {
        await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(data.refresh_token)}`, { method: "POST" }).catch(() => {});
      }
      await db.from("google_config").update({ refresh_token: null }).eq("id", 1);
      return json({ ok: true });
    }

    const cfg = await config();
    const token = await tokenDeAcesso(cfg.refresh_token);

    if (body.action === "download") {
      const meta = await (await g(token, `${API}/files/${encodeURIComponent(body.id)}?fields=name,mimeType`)).json();
      const arq = await g(token, `${API}/files/${encodeURIComponent(body.id)}?alt=media`);
      return new Response(arq.body, {
        headers: {
          ...cors,
          "Content-Type": meta.mimeType || "application/octet-stream",
          "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(meta.name || "documento")}`,
        },
      });
    }

    if (body.action === "remover") {
      if (!staff) return json({ error: "sem permissão" }, 403);
      await g(token, `${API}/files/${encodeURIComponent(body.id)}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trashed: true }),
      });
      return json({ ok: true });
    }

    if (body.action === "listar") {
      const q = `'${aspas(body.pasta_id)}' in parents and trashed = false`;
      const u = `${API}/files?q=${encodeURIComponent(q)}&fields=files(id,name,mimeType,size,createdTime)&orderBy=createdTime&pageSize=100`;
      const d = await (await g(token, u)).json();
      return json({ arquivos: (d.files || []).map((f: Record<string, string>) => ({
        drive_id: f.id, nome: f.name, mime: f.mimeType, tamanho: Number(f.size || 0), criado_em: f.createdTime,
      })) });
    }

    return json({ error: "ação inválida" }, 400);
  } catch (e) {
    return json({ error: (e as Error).message }, 400);
  }
});
