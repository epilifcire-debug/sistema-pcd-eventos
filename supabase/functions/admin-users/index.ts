// Edge Function: admin-users
// Cria, edita, redefine senha e ativa/desativa usuários do Sistema PCD Eventos.
// Regras: só admin e user podem chamar; só admin mexe em contas de admin.
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(url, service, { auth: { persistSession: false } });

    // Quem está chamando?
    const token = (req.headers.get("Authorization") || "").replace("Bearer ", "");
    const { data: who } = await admin.auth.getUser(token);
    if (!who?.user) return json({ error: "não autenticado" }, 401);
    const { data: me } = await admin.from("profiles").select("*").eq("id", who.user.id).single();
    if (!me || !me.ativo || !["admin", "user"].includes(me.role)) return json({ error: "sem permissão" }, 403);

    const body = await req.json();
    const { action } = body;
    const roles = ["admin", "user", "leitor"];

    const podeMexer = async (id: string) => {
      const { data: alvo } = await admin.from("profiles").select("role").eq("id", id).single();
      if (!alvo) throw new Error("usuário não encontrado");
      if (alvo.role === "admin" && me.role !== "admin") throw new Error("somente admin altera administradores");
    };

    if (action === "create") {
      const { email, password, nome, role = "user", acesso_conferidos = true, acesso_abada = true } = body;
      if (!email || !password || password.length < 6) return json({ error: "e-mail e senha (mín. 6) obrigatórios" }, 400);
      if (!roles.includes(role)) return json({ error: "perfil inválido" }, 400);
      if (role === "admin" && me.role !== "admin") return json({ error: "somente admin cria administradores" }, 403);
      const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      if (error) return json({ error: error.message }, 400);
      const { error: e2 } = await admin.from("profiles").insert({
        id: data.user.id, email, nome: nome || "", role, acesso_conferidos, acesso_abada, trocar_senha: true,
      });
      if (e2) return json({ error: e2.message }, 400);
      return json({ ok: true, id: data.user.id });
    }

    if (action === "update") {
      const { id, nome, role, acesso_conferidos, acesso_abada, ativo } = body;
      await podeMexer(id);
      if (role && !roles.includes(role)) return json({ error: "perfil inválido" }, 400);
      if (role === "admin" && me.role !== "admin") return json({ error: "somente admin promove a administrador" }, 403);
      if (id === me.id && (role && role !== me.role || ativo === false)) return json({ error: "você não pode rebaixar ou desativar a própria conta" }, 400);
      const patch: Record<string, unknown> = {};
      for (const [k, v] of Object.entries({ nome, role, acesso_conferidos, acesso_abada, ativo })) if (v !== undefined) patch[k] = v;
      const { error } = await admin.from("profiles").update(patch).eq("id", id);
      if (error) return json({ error: error.message }, 400);
      if (ativo !== undefined) await admin.auth.admin.updateUserById(id, { ban_duration: ativo ? "none" : "876000h" });
      return json({ ok: true });
    }

    if (action === "reset_password") {
      const { id, password } = body;
      await podeMexer(id);
      if (!password || password.length < 6) return json({ error: "senha mínima de 6 caracteres" }, 400);
      const { error } = await admin.auth.admin.updateUserById(id, { password });
      if (error) return json({ error: error.message }, 400);
      await admin.from("profiles").update({ trocar_senha: true }).eq("id", id);
      return json({ ok: true });
    }

    if (action === "delete") {
      const { id } = body;
      if (me.role !== "admin") return json({ error: "somente admin exclui usuários" }, 403);
      if (id === me.id) return json({ error: "você não pode excluir a própria conta" }, 400);
      const { error } = await admin.auth.admin.deleteUser(id);
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    return json({ error: "ação inválida" }, 400);
  } catch (e) {
    return json({ error: (e as Error).message }, 400);
  }
});
