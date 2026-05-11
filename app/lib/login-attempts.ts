import { supabase } from './supabase'

export type TentativaLogin = {
  id: string
  user_id: string
  email: string
  tentativas_erradas: number
  bloqueado_ate: string | null
  criado_em: string
  atualizado_em: string
}

/**
 * Verifica se o usuário está bloqueado por excesso de tentativas.
 * Usa função SECURITY DEFINER no banco — cliente não acessa a tabela diretamente.
 */
export async function verificarUserBloqueado(email: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('fn_verificar_bloqueio', {
    p_email: email.toLowerCase(),
  })

  if (error) {
    return false
  }

  return data === true
}

/**
 * Registra uma tentativa de login falhada e bloqueia se necessário.
 */
export async function registrarTentativaFalhada(email: string): Promise<void> {
  await supabase.rpc('fn_registrar_tentativa', { p_email: email.toLowerCase() })
}

/**
 * Limpa as tentativas de login falhadas após um login bem-sucedido.
 * Requer sessão autenticada.
 */
export async function limparTentativas(email: string): Promise<void> {
  await supabase.rpc('fn_limpar_tentativas', { p_email: email.toLowerCase() })
}

/**
 * Obtém o tempo restante de bloqueio em minutos (null = não bloqueado).
 */
export async function obterTempoRestanteBloqueio(email: string): Promise<number | null> {
  const { data, error } = await supabase.rpc('fn_tempo_restante_bloqueio', {
    p_email: email.toLowerCase(),
  })

  if (error || data === null || data === undefined) {
    return null
  }

  return data as number
}

/**
 * Obtém lista de porteiros bloqueados (para a tela de admin).
 */
export async function obterPorteirosBloqueados() {
  const { data } = await supabase.rpc('fn_porteiros_bloqueados')
  return (data as Pick<TentativaLogin, 'email' | 'tentativas_erradas' | 'bloqueado_ate'>[]) || []
}
