# Documentos no Google Drive — configuração

Conta: **caixaspoint@gmail.com**
Estrutura no Drive: `Documentos PcD / <Nome do cadastro> / arquivos`
A foto de perfil continua no Supabase; documentos (PDF e fotos de documento) vão para o Drive.

## 1. Google Cloud (logado como caixaspoint@gmail.com)
1. Acesse https://console.cloud.google.com e crie um projeto: **Sistema PCD**.
2. **APIs e serviços → Biblioteca** → procure **Google Drive API** → **Ativar**.
3. **Google Auth Platform** (ou "Tela de consentimento OAuth"):
   - Tipo de usuário: **Externo**
   - Nome do app: `Sistema PCD Eventos` · e-mail de suporte: caixaspoint@gmail.com
   - **Acesso a dados / Escopos** → adicione `.../auth/drive.file` (e `openid`, `email`)
   - **Público-alvo** → clique em **Publicar app** (status "Em produção").
     Sem publicar, a conexão expira a cada 7 dias.
4. **Clientes** (ou Credenciais) → **Criar cliente OAuth** → tipo **Aplicativo da Web**:
   - URI de redirecionamento autorizado:
     `https://SEU-PROJETO.supabase.co/functions/v1/google-drive`
     (o mesmo endereço da sua Project URL do Supabase + `/functions/v1/google-drive`)
   - Copie o **ID do cliente** e a **Chave secreta do cliente**.

## 2. Supabase
1. **SQL Editor** → rode `supabase/migrations/003_google_drive.sql`.
2. **Edge Functions → Secrets** → adicione:
   - `GOOGLE_CLIENT_ID` = ID do cliente
   - `GOOGLE_CLIENT_SECRET` = chave secreta
   - `APP_URL` = `https://sistemapcd.efcsys.com`
3. **Edge Functions → Deploy a new function → Via Editor**:
   - Nome: `google-drive` — confira depois que a URL termina em `/functions/v1/google-drive`
     (o painel às vezes cria com nome automático, como aconteceu com o admin-users).
   - Cole `supabase/functions/google-drive/index.ts` → **Deploy**.
   - Em **Details/Settings**, **desligue o Verify JWT** (o retorno do Google chega sem login;
     a função confere sozinha quem está chamando).

## 3. Sistema
1. Envie o código (`git add .` → `git commit` → `git push`) e espere o deploy.
2. Entre como admin → **Configurações** → **Conectar Google Drive** → escolha caixaspoint@gmail.com → **Permitir**.
   Se aparecer "O Google não verificou este app", clique em **Avançado → Acessar Sistema PCD Eventos** (é o seu próprio app).
3. Volta para o sistema com "Google Drive conectado!".
4. (Opcional) Ainda em Configurações → **Enviar para o Google Drive** os documentos antigos.

## Como funciona
- Ao salvar um cadastro com documentos novos, o sistema:
  1. usa a pasta já vinculada ao cadastro; se não houver,
  2. procura a pasta com o nome do cadastro dentro de "Documentos PcD"; se não houver,
  3. cria a pasta — e grava o vínculo no cadastro.
- Se o nome do cadastro mudar, a pasta é renomeada no próximo envio.
- Remover um documento no sistema manda o arquivo para a **lixeira do Drive** (recupera em até 30 dias).
- Excluir um cadastro **não apaga** a pasta no Drive.
- Abrir um documento puxa o arquivo direto do Drive; a equipe não precisa de acesso ao Drive.
- O sistema só enxerga arquivos que ele mesmo criou (permissão `drive.file`). Arquivos colocados
  manualmente dentro das pastas pelo site do Drive não aparecem no sistema.
