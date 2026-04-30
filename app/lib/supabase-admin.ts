import { createClient } from '@supabase/supabase-js'

type Perfil = 'admin' | 'porteiro'

type UsuarioPerfil = {
  id: string
  nome: string
  email: string
  perfil: Perfil
  ativo?: boolean | null
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

export function criarClienteSupabaseAdmin() {
  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  })
}

function criarClienteSupabaseRequisicao(token: string) {
  return createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  })
}

export async function validarAdminPorToken(token: string) {
  const clienteRequisicao = criarClienteSupabaseRequisicao(token)
  const {
    data: { user },
    error: erroAuth,
  } = await clienteRequisicao.auth.getUser()

  if (erroAuth || !user) {
    throw new Error('Nao autorizado.')
  }

  const adminClient = criarClienteSupabaseAdmin()
  const { data: perfil, error: erroPerfil } = await adminClient
    .from('usuarios')
    .select('id,nome,email,perfil,ativo')
    .eq('id', user.id)
    .maybeSingle<UsuarioPerfil>()

  if (erroPerfil || !perfil || perfil.perfil !== 'admin' || perfil.ativo === false) {
    throw new Error('Acesso negado.')
  }

  return { adminClient, perfil, user }
}
