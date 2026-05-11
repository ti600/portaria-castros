-- ============================================================
-- MIGRATION DE SEGURANÇA
-- Aplica RLS nas tabelas sensíveis e corrige permissões
-- ============================================================

-- 1. Função auxiliar: verifica se o usuário atual é admin
--    SECURITY DEFINER evita recursão ao ser usada dentro do próprio RLS de usuarios
-- ============================================================
CREATE OR REPLACE FUNCTION public.eh_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.usuarios
    WHERE id = auth.uid()::text
      AND perfil = 'admin'
      AND ativo IS NOT FALSE
  );
$$;

GRANT EXECUTE ON FUNCTION public.eh_admin() TO authenticated;

-- 2. RLS na tabela registros
--    Porteiros autenticados: INSERT / SELECT / UPDATE (saída)
--    DELETE: apenas admins
-- ============================================================
ALTER TABLE public.registros ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public'
      AND tablename = 'registros' AND policyname = 'registros_select_authenticated'
  ) THEN
    CREATE POLICY registros_select_authenticated ON public.registros
      FOR SELECT TO authenticated USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public'
      AND tablename = 'registros' AND policyname = 'registros_insert_authenticated'
  ) THEN
    CREATE POLICY registros_insert_authenticated ON public.registros
      FOR INSERT TO authenticated WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public'
      AND tablename = 'registros' AND policyname = 'registros_update_authenticated'
  ) THEN
    CREATE POLICY registros_update_authenticated ON public.registros
      FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public'
      AND tablename = 'registros' AND policyname = 'registros_delete_admin'
  ) THEN
    CREATE POLICY registros_delete_admin ON public.registros
      FOR DELETE TO authenticated USING (eh_admin());
  END IF;
END $$;

-- 3. RLS na tabela usuarios
--    SELECT: usuário vê o próprio perfil; admin vê todos
--    INSERT / UPDATE / DELETE: rotas de admin usam service_role (bypassa RLS)
--    Esta policy bloqueia porteiros de verem dados de outros usuários via client direto
-- ============================================================
ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public'
      AND tablename = 'usuarios' AND policyname = 'usuarios_select'
  ) THEN
    -- auth.uid()::text e auth.email() vêm do JWT (não podem ser forjados pelo cliente)
    -- Permite busca por id OU por email (necessário para o fallback de sincronização de login)
    CREATE POLICY usuarios_select ON public.usuarios
      FOR SELECT TO authenticated
      USING (auth.uid()::text = id OR auth.email() = email OR eh_admin());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public'
      AND tablename = 'usuarios' AND policyname = 'usuarios_insert_admin'
  ) THEN
    CREATE POLICY usuarios_insert_admin ON public.usuarios
      FOR INSERT TO authenticated WITH CHECK (eh_admin());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public'
      AND tablename = 'usuarios' AND policyname = 'usuarios_update_admin'
  ) THEN
    CREATE POLICY usuarios_update_admin ON public.usuarios
      FOR UPDATE TO authenticated USING (eh_admin()) WITH CHECK (eh_admin());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public'
      AND tablename = 'usuarios' AND policyname = 'usuarios_delete_admin'
  ) THEN
    CREATE POLICY usuarios_delete_admin ON public.usuarios
      FOR DELETE TO authenticated USING (eh_admin());
  END IF;
END $$;

-- 4. Restringir leitura de logs apenas para admins
-- ============================================================
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public'
      AND tablename = 'logs_sistema' AND policyname = 'logs_sistema_select_authenticated'
  ) THEN
    DROP POLICY logs_sistema_select_authenticated ON public.logs_sistema;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public'
      AND tablename = 'logs_sistema' AND policyname = 'logs_sistema_select_admin'
  ) THEN
    CREATE POLICY logs_sistema_select_admin ON public.logs_sistema
      FOR SELECT TO authenticated USING (eh_admin());
  END IF;
END $$;

-- 5. Funções SECURITY DEFINER para login_attempts
--    Após habilitar RLS, nenhum cliente (anon/authenticated) acessa a tabela diretamente.
--    Toda operação passa por estas funções privilegiadas.
--    service_role (adminClient) continua com acesso irrestrito por padrão no Supabase.
-- ============================================================

-- Verifica se email está bloqueado (limpa bloqueios expirados automaticamente)
CREATE OR REPLACE FUNCTION public.fn_verificar_bloqueio(p_email text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bloqueado_ate timestamptz;
BEGIN
  SELECT bloqueado_ate INTO v_bloqueado_ate
  FROM public.login_attempts
  WHERE email = lower(p_email);

  IF v_bloqueado_ate IS NULL THEN
    RETURN false;
  END IF;

  IF now() >= v_bloqueado_ate THEN
    UPDATE public.login_attempts
    SET tentativas_erradas = 0, bloqueado_ate = null, atualizado_em = now()
    WHERE email = lower(p_email);
    RETURN false;
  END IF;

  RETURN true;
END;
$$;
GRANT EXECUTE ON FUNCTION public.fn_verificar_bloqueio(text) TO anon;

-- Retorna minutos restantes de bloqueio (null = não bloqueado)
CREATE OR REPLACE FUNCTION public.fn_tempo_restante_bloqueio(p_email text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bloqueado_ate timestamptz;
BEGIN
  SELECT bloqueado_ate INTO v_bloqueado_ate
  FROM public.login_attempts
  WHERE email = lower(p_email);

  IF v_bloqueado_ate IS NULL OR now() >= v_bloqueado_ate THEN
    RETURN null;
  END IF;

  RETURN CEIL(EXTRACT(EPOCH FROM (v_bloqueado_ate - now())) / 60);
END;
$$;
GRANT EXECUTE ON FUNCTION public.fn_tempo_restante_bloqueio(text) TO anon;

-- Registra tentativa falhada e aplica bloqueio se necessário (upsert atômico)
CREATE OR REPLACE FUNCTION public.fn_registrar_tentativa(p_email text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tentativas integer;
  v_bloqueado_ate timestamptz;
BEGIN
  SELECT tentativas_erradas INTO v_tentativas
  FROM public.login_attempts
  WHERE email = lower(p_email);

  v_tentativas := COALESCE(v_tentativas, 0) + 1;

  IF v_tentativas >= 4 THEN
    v_bloqueado_ate := now() + interval '30 minutes';
  END IF;

  INSERT INTO public.login_attempts (email, tentativas_erradas, bloqueado_ate)
  VALUES (lower(p_email), v_tentativas, v_bloqueado_ate)
  ON CONFLICT (email) DO UPDATE
    SET tentativas_erradas = EXCLUDED.tentativas_erradas,
        bloqueado_ate      = EXCLUDED.bloqueado_ate,
        atualizado_em      = now();
END;
$$;
GRANT EXECUTE ON FUNCTION public.fn_registrar_tentativa(text) TO anon;

-- Limpa tentativas após login bem-sucedido (requer sessão autenticada)
CREATE OR REPLACE FUNCTION public.fn_limpar_tentativas(p_email text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.login_attempts
  SET tentativas_erradas = 0, bloqueado_ate = null, atualizado_em = now()
  WHERE email = lower(p_email);
END;
$$;
GRANT EXECUTE ON FUNCTION public.fn_limpar_tentativas(text) TO authenticated;

-- Lista porteiros atualmente bloqueados (para a tela de admin)
CREATE OR REPLACE FUNCTION public.fn_porteiros_bloqueados()
RETURNS TABLE(email text, tentativas_erradas int, bloqueado_ate timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT la.email, la.tentativas_erradas, la.bloqueado_ate
  FROM public.login_attempts la
  WHERE la.bloqueado_ate IS NOT NULL
    AND la.bloqueado_ate > now()
  ORDER BY la.bloqueado_ate DESC;
END;
$$;
GRANT EXECUTE ON FUNCTION public.fn_porteiros_bloqueados() TO authenticated;

-- Habilitar RLS e revogar acesso direto de clientes à tabela
ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.login_attempts FROM anon, authenticated;

-- 6. Bucket de fotos: remover upload anônimo
--    A policy registros_fotos_insert_authenticated (apenas autenticados) permanece.
-- ============================================================
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'registros_fotos_insert'
  ) THEN
    DROP POLICY registros_fotos_insert ON storage.objects;
  END IF;
END $$;
