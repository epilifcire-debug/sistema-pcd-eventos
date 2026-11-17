# Sistema PCD Eventos (fora do Base44)

Cadastro de PCD, inscrição em eventos, conferência (check-in) com horário, retirada de abadá, relatórios (picos de acesso e comparativo entre dias), banco de fotos e gestão de usuários.

**Stack:** React + Vite (PWA) hospedado no **GitHub Pages** · **Supabase** (Postgres, Auth, Storage, Edge Function) — mesma linha do painel do PointBot.

```
supabase/migrations/001_schema.sql    → banco completo (tabelas, RLS, funções, buckets)
supabase/functions/admin-users/       → Edge Function de criação/edição de usuários
scripts/importar-backup.mjs           → importa o backup do Base44 (dados + fotos + usuários)
.github/workflows/deploy.yml          → deploy automático no GitHub Pages
src/                                  → app
```

---

## Passo a passo

### 1. Supabase — projeto e banco
1. Crie um projeto novo no Supabase (ex.: `pcd-eventos`). No plano grátis só cabem 2 projetos ativos por conta.
2. **SQL Editor → New query**: cole o conteúdo inteiro de `supabase/migrations/001_schema.sql` e clique em **Run**. Ele cria as tabelas, as regras de acesso (RLS), as funções e os buckets `fotos`, `documentos` e `eventos`. Pode rodar de novo sem problema.
3. **Authentication → Sign In / Providers → Email**: desligue **"Allow new users to sign up"** (só admin cria contas).
4. **Authentication → URL Configuration**: em *Site URL* coloque o endereço final do app (ex.: `https://epilifcire-debug.github.io/sistema-pcd-eventos/`). Isso serve para o link de "Esqueci minha senha".

### 2. Edge Function `admin-users`
**Edge Functions → Deploy a new function → Via Editor**, nome `admin-users`, cole `supabase/functions/admin-users/index.ts` e publique. Deixe o *Verify JWT* **ligado** (a função também confere o perfil de quem chama).

Pelo CLI, o equivalente é: `supabase functions deploy admin-users --project-ref SEU_REF`

### 3. Importar o backup do Base44
> Faça isso **antes de desligar o Base44**, porque as fotos ainda são baixadas dos links de lá.

No seu computador (Node 22):
```bash
npm install
copy .env.example .env      # Windows (no Linux/Mac: cp)
```
Preencha o `.env`:
- `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`: em *Project Settings → API*.
- `SUPABASE_SERVICE_ROLE_KEY`: na mesma tela (chave secreta, **nunca** vai para o GitHub; o `.gitignore` já bloqueia o `.env`).
- `SENHA_PROVISORIA`: a senha inicial de todos os usuários importados. Eles vão ter que trocar no primeiro acesso.

Extraia o ZIP do backup numa pasta `backup/` dentro do projeto (essa pasta também fica fora do Git) e rode:
```bash
node --env-file=.env scripts/importar-backup.mjs backup --simular   # confere os números
node --env-file=.env scripts/importar-backup.mjs backup             # importa de verdade
```
O script:
- copia eventos, cadastros, inscrições, conferências e histórico mantendo os mesmos IDs;
- baixa as **fotos**, os **documentos** e as **imagens dos eventos** do Base44 e sobe para o Supabase Storage;
- cria as contas dos usuários (e-mail + `SENHA_PROVISORIA`) com o mesmo perfil (admin, user, leitor);
- grava um `importacao-log-*.txt` com as pessoas sem foto e qualquer falha.

Pode rodar de novo quantas vezes quiser (atualiza em vez de duplicar).

### 4. Testar local
```bash
npm run dev
```
Abra o endereço que aparecer e entre com seu e-mail + senha provisória.

### 5. Publicar no GitHub Pages
1. Crie o repositório (ex.: `sistema-pcd-eventos`) e envie o código:
   ```bash
   git init && git add . && git commit -m "Sistema PCD Eventos"
   git branch -M main
   git remote add origin https://github.com/epilifcire-debug/sistema-pcd-eventos.git
   git push -u origin main
   ```
2. No repositório: **Settings → Secrets and variables → Actions → New repository secret**:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
3. **Settings → Pages → Source: GitHub Actions**.
4. Rode de novo o workflow em **Actions → Deploy no GitHub Pages → Run workflow** (ou faça qualquer push). A partir daí, todo push na `main` publica sozinho.

Domínio próprio (ex.: `pcd.efcsys.com`): em *Settings → Pages → Custom domain*, depois crie um CNAME na Hostinger apontando para `epilifcire-debug.github.io`, e atualize o *Site URL* no Supabase.

### 6. (Opcional) limpeza automática diária
O app já cancela as inscrições de eventos encerrados ou inativos sempre que alguém abre o sistema, igual ao Base44. Para rodar isso também no servidor, ative a extensão **pg_cron** (*Database → Extensions*) e rode:
```sql
select cron.schedule('pcd-expiradas', '0 7 * * *', $$select public.cancelar_inscricoes_expiradas()$$);
```

---

## O que mudou em relação ao Base44

- **Fotos e documentos agora são privados.** No Base44 eram links públicos. Agora só quem está logado vê (LGPD).
- **Conferência e abadá com horário e operador** (`conferido_em`, `conferido_por`). As conferências antigas aparecem como "Sem horário registrado".
- **As regras do leitor valem no servidor.** Ele só confere ou retira, não desfaz, e só nas telas liberadas para ele.
- **Usuário não cria nem edita administrador.** Só admin faz isso.
- **Conferências em tempo real:** um check-in feito em um celular aparece nos outros aparelhos sem precisar atualizar.
- **CPF duplicado:** o cadastro novo é bloqueado e avisa qual pessoa já tem aquele CPF. As duplicidades que vieram do backup foram mantidas, e o Banco de Dados e o Comparativo juntam as duas fichas pelo CPF.
- **E-mail de confirmação de inscrição não foi portado.** No Base44 ele já estava bloqueado para e-mails externos. Se quiser, dá para enviar pelo WhatsApp depois.
- **Inscrições de eventos encerrados** continuam aparecendo nos relatórios e no comparativo (canceladas por expiração, sem sumir do histórico).

## Perfis
| Perfil | Acesso |
|---|---|
| Administrador | Tudo, inclusive Banco de Dados, Cadastrados por Evento, resetar sistema e excluir usuários |
| Usuário | Operação completa (cadastros, eventos, conferência, relatórios, impressão, usuários não-admin) |
| Leitor | Só Conferidos e/ou Abadá (conforme marcado), sem desfazer |

<sub>by: efcsys</sub>
