'use client'

type Perfil = 'admin' | 'porteiro'

type Usuario = {
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

export function salvarSessaoUsuario(usuario: Usuario) {
  const sessao: SessaoUsuario = {
    usuario,
    expiraEm: Date.now() + DURACAO_SESSAO_MS,
  }

  localStorage.setItem(CHAVE_USUARIO, JSON.stringify(sessao))
}

export function limparSessaoUsuario() {
  localStorage.removeItem(CHAVE_USUARIO)
}

export function lerUsuarioLogado(): Usuario | null {
  const salvo = localStorage.getItem(CHAVE_USUARIO)

  if (!salvo) return null

  try {
    const conteudo = JSON.parse(salvo) as Usuario | SessaoUsuario

    if ('usuario' in conteudo && 'expiraEm' in conteudo) {
      if (Date.now() > conteudo.expiraEm) {
        limparSessaoUsuario()
        return null
      }

      return conteudo.usuario
    }

    const usuarioLegado = conteudo as Usuario
    salvarSessaoUsuario(usuarioLegado)
    return usuarioLegado
  } catch {
    limparSessaoUsuario()
    return null
  }
}
