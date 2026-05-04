import { supabase } from './supabase'

const MAX_TENTATIVAS = 4
const TEMPO_BLOQUEIO_MS = 30 * 60 * 1000 // 30 minutos

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
 * Verifica se o usuário está bloqueado por excesso de tentativas
 */
export async function verificarUserBloqueado(email: string): Promise<boolean> {
  const emailNormalizado = email.toLowerCase()

  const { data, error } = await supabase
    .from('login_attempts')
    .select('bloqueado_ate')
    .eq('email', emailNormalizado)
    .maybeSingle<Pick<TentativaLogin, 'bloqueado_ate'>>()

  if (error) {
    return false
  }

  if (!data?.bloqueado_ate) {
    return false
  }

  const bloqueadoAte = new Date(data.bloqueado_ate)
  const agora = new Date()

  if (agora < bloqueadoAte) {
    return true
  }

  // Bloqueio expirou, remover o bloqueio
  await limparBloqueio(emailNormalizado)
  return false
}

/**
 * Registra uma tentativa de login falhada e bloqueia se necessário
 */
export async function registrarTentativaFalhada(email: string): Promise<void> {
  const emailNormalizado = email.toLowerCase()

  const agora = new Date().toISOString()

  // Verificar se já existe registro
  const { data: existente, error: erroFetch } = await supabase
    .from('login_attempts')
    .select('tentativas_erradas')
    .eq('email', emailNormalizado)
    .maybeSingle<Pick<TentativaLogin, 'tentativas_erradas'>>()

  if (erroFetch) {
    return
  }

  const tentativasAtuais = (existente?.tentativas_erradas || 0) + 1

  const bloqueadoAte = tentativasAtuais >= MAX_TENTATIVAS ? new Date(Date.now() + TEMPO_BLOQUEIO_MS).toISOString() : null

  if (existente) {
    // Atualizar registro existente
    const { error: erroUpdate } = await supabase
      .from('login_attempts')
      .update({
        tentativas_erradas: tentativasAtuais,
        bloqueado_ate: bloqueadoAte,
        atualizado_em: agora,
      })
      .eq('email', emailNormalizado)

    // Error handled silently
  } else {
    // Criar novo registro
    const { error: erroInsert } = await supabase
      .from('login_attempts')
      .insert({
        email: emailNormalizado,
        tentativas_erradas: tentativasAtuais,
        bloqueado_ate: bloqueadoAte,
        criado_em: agora,
        atualizado_em: agora,
      })

    // Error handled silently
  }
}

/**
 * Limpa as tentativas de login falhadas após um login bem-sucedido
 */
export async function limparTentativas(email: string): Promise<void> {
  await supabase
    .from('login_attempts')
    .update({
      tentativas_erradas: 0,
      bloqueado_ate: null,
      atualizado_em: new Date().toISOString(),
    })
    .eq('email', email.toLowerCase())
}

/**
 * Remove bloqueio de um email (administrativo)
 */
export async function limparBloqueio(email: string): Promise<void> {
  await supabase
    .from('login_attempts')
    .update({
      tentativas_erradas: 0,
      bloqueado_ate: null,
      atualizado_em: new Date().toISOString(),
    })
    .eq('email', email.toLowerCase())
}

/**
 * Obtém o tempo restante de bloqueio em minutos
 */
export async function obterTempoRestanteBloqueio(email: string): Promise<number | null> {
  const { data, error } = await supabase
    .from('login_attempts')
    .select('bloqueado_ate')
    .eq('email', email.toLowerCase())
    .maybeSingle<Pick<TentativaLogin, 'bloqueado_ate'>>()

  if (error || !data?.bloqueado_ate) {
    return null
  }

  const bloqueadoAte = new Date(data.bloqueado_ate)
  const agora = new Date()
  const diferenca = bloqueadoAte.getTime() - agora.getTime()

  return diferenca > 0 ? Math.ceil(diferenca / 60000) : null // retorna minutos
}

/**
 * Obtém lista de porteiros bloqueados
 */
export async function obterPorteirosBloqueados() {
  const { data } = await supabase
    .from('login_attempts')
    .select('email, tentativas_erradas, bloqueado_ate')
    .not('bloqueado_ate', 'is', null)
    .gt('bloqueado_ate', new Date().toISOString())
    .order('bloqueado_ate', { ascending: false })

  return data || []
}
