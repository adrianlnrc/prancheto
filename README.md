# prancheto

A pelada se organiza sozinha. Web app (Next.js + Supabase) pra organizar racha/pelada de futebol: lista de presença por ordem de chegada, sorteio de times e fila de jogo com "vencedor fica".

Sem login — cada grupo tem um link fixo; quem abre só digita o nome. Veja `docs/plan-v1.md` pro plano completo do produto.

## Rodando localmente

1. Crie um projeto no [Supabase](https://supabase.com).
2. Rode a migration em `supabase/migrations/0001_init.sql` (SQL Editor do painel, ou `supabase db push` com a CLI).
3. Copie `.env.local.example` para `.env.local` e preencha com a URL e a anon key do projeto (Project Settings → API).
4. `npm install`
5. `npm run dev` e abra `http://localhost:3000`.

## Deploy

Deploy do frontend na [Vercel](https://vercel.com) (importe o repo, configure as duas env vars acima). O backend é o próprio projeto Supabase — sem servidor adicional pra manter.

## Stack

- Next.js (App Router) + TypeScript + Tailwind v4
- Supabase (Postgres + Realtime) — a lógica do jogo (fila, sorteio, rotação de vencedor) vive em funções SQL (`supabase/migrations/0001_init.sql`) pra ficar atômica com vários dispositivos editando o mesmo grupo ao mesmo tempo
- Sem autenticação: RLS liberado pra qualquer um com o link do grupo (ver comentário no topo da migration)
