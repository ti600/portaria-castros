import { NextResponse } from 'next/server'
import { validarAdminPorToken } from '../../../../../lib/supabase-admin'

type BodyAtualizarSenha = {
  senha?: string
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
