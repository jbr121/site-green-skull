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

## Sobrecarga e DDoS (camada do app)

O servidor limita taxa por IP, concorrência, tamanho de JSON e tempo de pedido.
Isso reduz abuso e picos no Node. **Não substitui proteção de borda** contra tráfego volumétrico.

Em produção, coloque a loja atrás de um proxy com WAF (Cloudflare, Nginx `limit_req`, ou o da hospedagem) e HTTPS.

Variáveis opcionais:

| Variável | Padrão (produção) | Função |
|---|---|---|
| `RATE_LIMIT_MAX` | 300 / min | Teto geral por IP |
| `RATE_LIMIT_API_MAX` | 120 / min | Teto das rotas `/api` |
| `RATE_LIMIT_LOGIN_MAX` | 5 / 15 min | Tentativas de login sem sucesso |
| `MAX_IN_FLIGHT` | 80 | Pedidos simultâneos no processo |
| `REQUEST_TIMEOUT_MS` | 30000 | Tempo máximo de um pedido |
| `JSON_BODY_LIMIT` | 256kb | Tamanho máximo do JSON |
| `BASIC_AUTH_USER` / `BASIC_AUTH_PASS` | (desligado) | Trava a vitrine se os dois existirem |
| `SESSION_SECRET` | (obrigatório) | Assinatura do cookie de sessão |

Respostas de proteção: `429` (muitas requisições), `503` (servidor ocupado), `413` (corpo grande), `408` (tempo esgotado).

## Checklist pós-deploy

- [ ] Loja abre no domínio com HTTPS
- [ ] Admin login funciona
- [ ] Upload de foto de produto funciona
- [ ] Pedido abre WhatsApp com mensagem correta
- [ ] Backup agendado (cron semanal recomendado)
- [ ] Proxy/WAF na frente do Node (Cloudflare ou equivalente)
- [ ] `SESSION_SECRET` definido; senha padrão do admin trocada
