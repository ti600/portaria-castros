import { supabase } from './supabase'

export type AcaoLog =
  | 'entrada_registrada'
  | 'saida_registrada'
  | 'reentrada_registrada'
  | 'foto_enviada'
  | 'usuario_criado'
  | 'usuario_status_alterado'
  | 'senha_alterada'
  | 'relatorio_excel_exportado'
  | 'relatorio_pdf_exportado'

export type LogSistema = {
  acao: AcaoLog
  created_at?: string | null
  detalhes?: string | null
  id: string
  usuario_email?: string | null
  usuario_nome?: string | null
}

type RegistrarLogInput = {
  acao: AcaoLog
  detalhes?: string
  usuarioEmail?: string
  usuarioNome?: string
}

export async function registrarLog(input: RegistrarLogInput) {
  const { error } = await supabase.from('logs_sistema').insert({
    acao: input.acao,
    detalhes: input.detalhes || null,
    usuario_email: input.usuarioEmail || null,
    usuario_nome: input.usuarioNome || null,
  })

  if (error) {
    console.warn('Nao foi possivel registrar log:', error.message)
  }
}

export async function listarLogs() {
  const { data, error } = await supabase
    .from('logs_sistema')
    .select('*')
    .order('created_at', { ascending: false })

  return {
    data: (data || []) as LogSistema[],
    error,
  }
}
