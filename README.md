# Controle de Portaria

Aplicacao Next.js para registrar entradas e saidas de visitantes/prestadores, com painel de administrador e painel operacional de portaria.

## Requisitos

- Node.js 20 ou superior
- Projeto Supabase criado
- Tabelas `usuarios` e `registros` no Supabase

## Variaveis de ambiente

Crie um arquivo `.env.local` com:

```env
NEXT_PUBLIC_SUPABASE_URL=sua_url_do_supabase
NEXT_PUBLIC_SUPABASE_ANON_KEY=sua_chave_anon_do_supabase
```

O arquivo `.env.example` fica no repositorio apenas como modelo. Nao coloque a chave `service_role` no frontend.

## Rodar localmente

```bash
npm install
npm run dev
```

Depois acesse `http://localhost:3000`.

## Habilitar fotos no Supabase

Para o anexo de foto funcionar, execute o SQL de `supabase-fotos.sql` no SQL Editor do Supabase. Ele cria:

- coluna `foto_url` na tabela `registros`
- bucket publico `registros-fotos`
- politicas para leitura e upload das imagens pelo app

## Habilitar logs do sistema

Para ativar a aba de logs no painel admin, execute tambem `supabase-admin-recursos.sql` no SQL Editor do Supabase.

Esse arquivo cria:

- tabela `logs_sistema`
- politicas para leitura e gravacao dos logs pelo app

## Deploy na Vercel

1. Suba este projeto para um repositorio no GitHub.
2. Entre em `https://vercel.com/new` e importe o repositorio.
3. Mantenha os comandos padrao:
   - Build Command: `npm run build`
   - Install Command: `npm install`
   - Output Directory: deixar em branco
4. Cadastre as variaveis de ambiente na Vercel:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
5. Publique o projeto.

## Deploy em servidor Node.js

Qualquer hospedagem que rode Node.js pode executar:

```bash
npm run build
npm run start
```

O app usa Supabase pelo navegador, entao a hospedagem precisa apenas servir o Next.js com as variaveis publicas acima configuradas.
