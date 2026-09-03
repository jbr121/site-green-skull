# Publicar a loja GOLD SKULL online

## Antes de subir

1. Troque a senha do admin no painel (`/admin` → Acessos).
2. Defina `SESSION_SECRET` no servidor (string longa e aleatória).
3. Faça backup de `data/db.json` e `data/uploads/` (ou rode `node scripts/backup-db.js`).

## Opção A — VPS (Hostinger, DigitalOcean, etc.)

```bash
# No servidor
git clone <seu-repo> gold-skull
cd gold-skull
npm install --production
SESSION_SECRET="sua-chave-secreta" PORT=3000 node server.js
```

Use **PM2** ou **systemd** para manter o processo rodando:

```bash
npm install -g pm2
SESSION_SECRET="sua-chave-secreta" pm2 start server.js --name gold-skull
pm2 save
```

Configure **Nginx** como proxy reverso na porta 3000 e ative **HTTPS** (Let's Encrypt / Certbot).

## Opção B — Railway ou Render

1. Conecte o repositório Git.
2. Comando de start: `node server.js`
3. Variáveis de ambiente:
   - `PORT` (geralmente definida pela plataforma)
   - `SESSION_SECRET`
4. Volume persistente para `data/` (db.json + uploads).

## Domínio

Aponte o DNS (registro A ou CNAME) para o IP/serviço do host. Ative HTTPS antes de divulgar o link.

## Backup manual

```bash
node scripts/backup-db.js
```

Gera cópia em `backups/db-AAAA-MM-DD.json`.

## Checklist pós-deploy

- [ ] Loja abre no domínio com HTTPS
- [ ] Admin login funciona
- [ ] Upload de foto de produto funciona
- [ ] Pedido abre WhatsApp com mensagem correta
- [ ] Backup agendado (cron semanal recomendado)
