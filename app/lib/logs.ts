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

export type FiltrosLog = {
  acao?: AcaoLog | ''
  dataFim?: string
  dataInicio?: string
  pesquisa?: string
  limite?: number
}

export const opcoesAcaoLog: Array<{ label: string; value: AcaoLog }> = [
  { value: 'entrada_registrada', label: 'Entrada registrada' },
  { value: 'saida_registrada', label: 'Saida registrada' },
  { value: 'reentrada_registrada', label: 'Reentrada registrada' },
  { value: 'foto_enviada', label: 'Foto enviada' },
  { value: 'usuario_criado', label: 'Usuario criado' },
  { value: 'usuario_status_alterado', label: 'Status de usuario alterado' },
  { value: 'senha_alterada', label: 'Senha alterada' },
  { value: 'relatorio_excel_exportado', label: 'Relatorio Excel exportado' },
  { value: 'relatorio_pdf_exportado', label: 'Relatorio PDF exportado' },
]

export function formatarAcaoLog(acao: AcaoLog) {
  return opcoesAcaoLog.find((opcao) => opcao.value === acao)?.label || acao
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

export async function listarLogs(filtros: FiltrosLog = {}) {
  let query = supabase
    .from('logs_sistema')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(filtros.limite || 100)

  if (filtros.dataInicio) {
    query = query.gte('created_at', `${filtros.dataInicio}T00:00:00`)
  }

  if (filtros.dataFim) {
    query = query.lte('created_at', `${filtros.dataFim}T23:59:59`)
  }

  if (filtros.acao) {
    query = query.eq('acao', filtros.acao)
  }

  if (filtros.pesquisa?.trim()) {
    const termo = filtros.pesquisa.trim()
    query = query.or(
      `acao.ilike.%${termo}%,detalhes.ilike.%${termo}%,usuario_email.ilike.%${termo}%,usuario_nome.ilike.%${termo}%`
    )
  }

  const { data, error } = await query

  return {
    data: (data || []) as LogSistema[],
    error,
  }
}
