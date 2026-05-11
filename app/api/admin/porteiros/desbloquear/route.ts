import { NextResponse } from 'next/server'
import { validarAdminPorToken } from '../../../../lib/supabase-admin'

type BodyDesbloquearPorteiro = {
  email?: string
}

export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization') || request.headers.get('Authorization')
  const token = authHeader?.replace(/^Bearer\s+/i, '').trim()

  if (!token) {
    return NextResponse.json({ error: 'Nao autorizado.' }, { status: 401 })
  }

  const body = (await request.json().catch(() => null)) as BodyDesbloquearPorteiro | null
  const email = body?.email?.trim().toLowerCase() || ''

  if (!email) {
    return NextResponse.json({ error: 'Informe o email do porteiro para desbloquear.' }, { status: 400 })
  }

  try {
    const { adminClient } = await validarAdminPorToken(token)

    // adminClient usa service_role e bypassa RLS — única forma de alterar login_attempts no servidor
    await adminClient
      .from('login_attempts')
      .update({ tentativas_erradas: 0, bloqueado_ate: null, atualizado_em: new Date().toISOString() })
      .eq('email', email)

    return NextResponse.json({ ok: true, mensagem: `Porteiro ${email} desbloqueado com sucesso.` })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Nao foi possivel desbloquear o porteiro.' },
      { status: 500 }
    )
  }
}
