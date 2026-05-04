-- Tabela para rastrear tentativas de login falhadas
CREATE TABLE IF NOT EXISTS public.login_attempts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  email text NOT NULL UNIQUE,
  tentativas_erradas int DEFAULT 0,
  bloqueado_ate timestamp with time zone,
  criado_em timestamp with time zone NOT NULL DEFAULT now(),
  atualizado_em timestamp with time zone NOT NULL DEFAULT now()
);

-- Índices para melhor performance
CREATE INDEX IF NOT EXISTS idx_login_attempts_email ON public.login_attempts(email);
CREATE INDEX IF NOT EXISTS idx_login_attempts_bloqueado_ate ON public.login_attempts(bloqueado_ate);

-- Desabilitar Row Level Security inicialmente para funcionar
ALTER TABLE public.login_attempts DISABLE ROW LEVEL SECURITY;

-- Garantir que a tabela seja acessível
GRANT ALL ON public.login_attempts TO anon, authenticated, service_role;
