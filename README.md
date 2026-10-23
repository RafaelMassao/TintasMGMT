# TintasMGMT

Sistema de gestão para uma fábrica de tintas, desenvolvido com React, TanStack Start, TypeScript e Supabase.

## Desenvolvimento local

Requisitos: Node.js e npm.

```sh
git clone https://github.com/RafaelMassao/TintasMGMT.git
cd TintasMGMT
npm install
npm run dev
```

Configure as variáveis `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` no ambiente local antes de iniciar a aplicação.

## Build

```sh
NITRO_PRESET=vercel npm run build
```

## Banco de dados

Os scripts SQL do Supabase ficam no diretório `supabase/`. Revise e execute as alterações necessárias manualmente no SQL Editor do projeto Supabase correspondente.
