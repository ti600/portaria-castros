import { NextResponse } from 'next/server'
import { validarAdminPorToken } from '../../../../../lib/supabase-admin'

type BodyAtualizarSenha = {
  senha?: string
}

type ValidacaoSenha = {
  valida: boolean
  mensagens: string[]
}

/**
 * Valida a força da senha baseado em critérios de segurança
 * Requisitos:
 * - Mínimo 8 caracteres
 * - Pelo menos uma letra maiúscula
 * - Pelo menos uma letra minúscula
 * - Pelo menos um número
 * - Pelo menos um caractere especial
 */
function validarForcaSenha(senha: string): ValidacaoSenha {
  const mensagens: string[] = []

  if (senha.length < 8) {
    mensagens.push('A senha deve ter no mínimo 8 caracteres')
  }

  if (!/[A-Z]/.test(senha)) {
    mensagens.push('A senha deve conter pelo menos uma letra maiúscula')
  }

  if (!/[a-z]/.test(senha)) {
    mensagens.push('A senha deve conter pelo menos uma letra minúscula')
  }

  if (!/[0-9]/.test(senha)) {
    mensagens.push('A senha deve conter pelo menos um número')
  }

  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(senha)) {
    mensagens.push('A senha deve conter pelo menos um caractere especial (!@#$%^&*...)')
  }

  return {
    valida: mensagens.length === 0,
    mensagens,
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const authHeader = request.headers.get('authorization') || request.headers.get('Authorization')
  const token = authHeader?.replace(/^Bearer\s+/i, '').trim()

  if (!token) {
    return NextResponse.json({ error: 'Nao autorizado.' }, { status: 401 })
  }

  const { id } = await context.params
  const body = (await request.json().catch(() => null)) as BodyAtualizarSenha | null
  const senha = body?.senha || ''

  if (!id || !senha.trim()) {
    return NextResponse.json({ error: 'Informe uma nova senha para atualizar o usuario.' }, { status: 400 })
  }

  // Validar força da senha
  const validacao = validarForcaSenha(senha)
  if (!validacao.valida) {
    return NextResponse.json(
      { error: 'Senha fraca. ' + validacao.mensagens.join(' ') },
      { status: 400 }
    )
  }

  try {
    const { adminClient } = await validarAdminPorToken(token)

    const { error } = await adminClient.auth.admin.updateUserById(id, {
      password: senha,
    })

    if (error) {
      return NextResponse.json(
        { error: error.message || 'Nao foi possivel atualizar a senha.' },
        { status: 400 }
      )
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Nao foi possivel atualizar a senha.' },
      { status: 500 }
    )
  }
}
