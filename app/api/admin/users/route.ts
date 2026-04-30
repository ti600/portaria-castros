import { NextResponse } from 'next/server'
import { validarAdminPorToken } from '../../../lib/supabase-admin'

type Perfil = 'admin' | 'porteiro'

type BodyCriarUsuario = {
  nome?: string
  email?: string
  senha?: string
  perfil?: Perfil
}

export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization') || request.headers.get('Authorization')
  const token = authHeader?.replace(/^Bearer\s+/i, '').trim()

  if (!token) {
    return NextResponse.json({ error: 'Nao autorizado.' }, { status: 401 })
  }

  const body = (await request.json().catch(() => null)) as BodyCriarUsuario | null
  const nome = body?.nome?.trim() || ''
  const email = body?.email?.trim().toLowerCase() || ''
  const senha = body?.senha || ''
  const perfil = body?.perfil === 'admin' ? 'admin' : 'porteiro'

  if (!nome || !email || !senha) {
    return NextResponse.json(
      { error: 'Preencha nome, e-mail e senha para criar o usuario.' },
      { status: 400 }
    )
  }

  try {
    const { adminClient } = await validarAdminPorToken(token)

    const { data: authCriado, error: erroAuth } = await adminClient.auth.admin.createUser({
      email,
      password: senha,
      email_confirm: true,
      user_metadata: { nome },
    })

    if (erroAuth || !authCriado.user) {
      return NextResponse.json(
        { error: erroAuth?.message || 'Nao foi possivel criar o usuario no Auth.' },
        { status: 400 }
      )
    }

    const { error: erroPerfil } = await adminClient.from('usuarios').upsert({
      id: authCriado.user.id,
      nome,
      email,
      perfil,
      ativo: true,
      senha: '_auth_managed_',
    })

    if (erroPerfil) {
      await adminClient.auth.admin.deleteUser(authCriado.user.id)
      return NextResponse.json(
        { error: 'Usuario criado no Auth, mas o perfil nao foi salvo na tabela usuarios.' },
        { status: 400 }
      )
    }

    return NextResponse.json({ ok: true, id: authCriado.user.id })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Nao foi possivel criar o usuario.' },
      { status: 500 }
    )
  }
}
