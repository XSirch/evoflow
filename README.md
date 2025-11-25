## EvoFlow – Gerenciador de Bot WhatsApp

EvoFlow é um painel (frontend) + backend para gerenciar um bot de WhatsApp para lojas (ex.: pizzaria, restaurante, delivery).

Ele integra:

- **Evolution API** para envio/recebimento de mensagens no WhatsApp.
- **OpenRouter** como LLM para gerar respostas inteligentes.
- **RAG com PostgreSQL + pgvector** para usar uma Base de Conhecimento da loja.
- **Envio automático de PDF de cardápio** via WhatsApp.

---

## Tecnologias principais

- Frontend: **React + Vite + TypeScript**
- Backend: **Node.js + Express (ESM)**
- Banco de dados: **PostgreSQL** com extensão `vector` (pgvector)
- IA (chat): **OpenRouter** (`OPENROUTER_API_KEY`, `OPENROUTER_MODEL`)
- IA (embeddings/RAG): **OpenAI** (`OPENAI_API_KEY`)
- Integração WhatsApp: **Evolution API**

---

## Pré-requisitos

- Node.js **>= 20**
- PostgreSQL com extensão `vector` instalada
- Conta no **OpenRouter** (para chat)
- Conta na **OpenAI** (para embeddings, usada no RAG)
- Instância configurada na **Evolution API** (URL base, API key, nome da instância, número de WhatsApp)

---

## Configuração de ambiente

Crie um arquivo `.env` na raiz do projeto com as variáveis de ambiente necessárias. O backend carrega esse arquivo via `dotenv` e o Vite lê as mesmas chaves via `loadEnv`.

Exemplo de `.env`:

```bash
# Banco de dados
DATABASE_URL=postgres://usuario:senha@localhost:5432/evoflow
## Opcional: URL de fallback
# DATABASE_URL_FALLBACK=postgres://usuario:senha@outro-host:5432/evoflow

# OpenRouter (LLM para chat)
OPENROUTER_API_KEY=sk-or-...
OPENROUTER_MODEL=openai/gpt-4o-mini

# OpenAI (embeddings para RAG)
OPENAI_API_KEY=sk-...
# EMBEDDING_MODEL=text-embedding-3-small   # opcional, usa esse como padrão

# Backend
PORT=4000
MAX_TOKENS_PER_CONVERSATION=30000
MESSAGE_DEBOUNCE_MS=5000
```

Outras variáveis avançadas (como `CHUNK_SIZE`, `CHUNK_OVERLAP`) possuem valores padrão no código e podem ser ajustadas conforme necessidade.

---

## Como rodar localmente

1. **Instale as dependências** na raiz do projeto:

   ```bash
   npm install
   ```

2. **Suba o PostgreSQL** e crie o banco especificado em `DATABASE_URL`.

3. **Crie o arquivo `.env`** na raiz, seguindo o exemplo acima.

4. **Inicie o backend** (roda migrações automaticamente):

   ```bash
   npm run backend
   ```

   - O backend ficará disponível em: `http://localhost:4000`
   - Endpoint de saúde: `GET /api/health`

5. Em outro terminal, **inicie o frontend** (Vite):

   ```bash
   npm run dev
   ```

   - O frontend ficará disponível em: `http://localhost:3000`

6. Acesse `http://localhost:3000` no navegador e:

   - Registre um usuário (página de login/registro).
   - Configure a loja (nome, descrição, horário, tom de voz, mensagem padrão).
   - Faça upload do **PDF de cardápio**.
   - Configure a **Evolution API** (URL base, API key, nome da instância, número de WhatsApp) e use o botão de **Testar Conexão**.

7. Aponte o **Webhook da Evolution API** para o backend (em produção):

   ```text
   https://SEU-DOMINIO/api/evolution/messages-upsert
   ```

   Em ambiente local, isso só funciona se a Evolution conseguir acessar seu `localhost` (via túnel, por exemplo):

   ```text
   http://localhost:4000/api/evolution/messages-upsert
   ```

---

## Funcionalidades principais

- Dashboard com visão de **conversas**, status (ativo, aguardando humano, concluído) e estatísticas.
- Gestão de **contatos** com status de permissão (opt-in / opt-out) para mensagens de marketing.
- Upload e envio automático do **PDF de cardápio** via WhatsApp, usando Evolution API.
- Base de conhecimento com **RAG** (documentos são indexados em `document_embeddings` com pgvector).
- **Simulador de conversa** no frontend usando OpenRouter, permitindo testar fluxos sem depender do WhatsApp real.
- Integração completa com Evolution API para receber webhooks e responder clientes em tempo real, respeitando tags como permissões, transbordo humano e envio de cardápio.

---

## Avisos importantes

- **Nunca** commit suas credenciais reais (`.env`, chaves de API, etc.). O `.gitignore` já está configurado para ignorar `.env` e diretórios de uploads.
- Certifique-se de que o PDF de cardápio esteja acessível publicamente (o backend serve os arquivos em `/api/uploads`), pois a Evolution exige **URL absoluta** ou **base64** para envio de mídia.

