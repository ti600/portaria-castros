'use client'

import type { User } from '@supabase/supabase-js'
import { supabase } from './supabase'

export type Perfil = 'admin' | 'porteiro'

export type Usuario = {
  id: string
  nome: string
  email: string
  perfil: Perfil
  ativo?: boolean | null
}

type SessaoUsuario = {
  expiraEm: number
  usuario: Usuario
}

const CHAVE_USUARIO = 'usuario'
const DURACAO_SESSAO_MS = 12 * 60 * 60 * 1000

function lerSessaoLocal(): SessaoUsuario | null {
  const salvo = localStorage.getItem(CHAVE_USUARIO)

  if (!salvo) return null

  try {
    const conteudo = JSON.parse(salvo) as Usuario | SessaoUsuario

    if ('usuario' in conteudo && 'expiraEm' in conteudo) {
      return conteudo
    }

    const usuarioLegado = conteudo as Usuario
    const sessaoLegada: SessaoUsuario = {
      usuario: usuarioLegado,
      expiraEm: Date.now() + DURACAO_SESSAO_MS,
    }

    localStorage.setItem(CHAVE_USUARIO, JSON.stringify(sessaoLegada))
    return sessaoLegada
  } catch {
    localStorage.removeItem(CHAVE_USUARIO)
    return null
  }
}

export function salvarSessaoUsuario(usuario: Usuario, expiraEm = Date.now() + DURACAO_SESSAO_MS) {
  const sessao: SessaoUsuario = {
    usuario,
    expiraEm,
  }

  localStorage.setItem(CHAVE_USUARIO, JSON.stringify(sessao))
}

export async function limparSessaoUsuario() {
  localStorage.removeItem(CHAVE_USUARIO)
  await supabase.auth.signOut()
}

export async function carregarPerfilAuth(authUser: Pick<User, 'id' | 'email'>): Promise<Usuario | null> {
  const email = authUser.email?.trim().toLowerCase() || ''

  const { data: porId, error: erroPorId } = await supabase
    .from('usuarios')
    .select('id,nome,email,perfil,ativo')
    .eq('id', authUser.id)
    .maybeSingle<Usuario>()

  if (erroPorId) {
    throw erroPorId
  }

  if (porId) {
    return porId
  }

  if (!email) {
    return null
  }

  const { data: porEmail, error: erroPorEmail } = await supabase
    .from('usuarios')
    .select('id,nome,email,perfil,ativo')
    .eq('email', email)
    .maybeSingle<Usuario>()

  if (erroPorEmail) {
    throw erroPorEmail
  }

  if (!porEmail) {
    return null
  }

  const { error: erroSincronizacao } = await supabase
    .from('usuarios')
    .update({ id: authUser.id, email })
    .eq('id', porEmail.id)

  if (erroSincronizacao) {
    throw erroSincronizacao
  }

  return {
    ...porEmail,
    id: authUser.id,
    email,
  }
}

export async function lerUsuarioLogado(): Promise<Usuario | null> {
  const sessaoLocal = lerSessaoLocal()

  if (sessaoLocal && Date.now() > sessaoLocal.expiraEm) {
    await limparSessaoUsuario()
    return null
  }

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    localStorage.removeItem(CHAVE_USUARIO)
    return null
  }

  if (sessaoLocal?.usuario.id === user.id) {
    return sessaoLocal.usuario
  }

  const perfil = await carregarPerfilAuth(user)

  if (!perfil || perfil.ativo === false) {
    await limparSessaoUsuario()
    return null
  }

  salvarSessaoUsuario(perfil, sessaoLocal?.expiraEm)
  return perfil
}
