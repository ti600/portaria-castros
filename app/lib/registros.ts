import { fimDoDiaLocalEmIso, inicioDoDiaLocalEmIso } from './date-range'
import { supabase } from './supabase'
import { MaterialEvento, Registro } from './registros-types'

type ConsultarRegistrosParams = {
  dataInicio?: string
  dataFim?: string
  pesquisa?: string
}

type RegistrarSaidaParams = {
  registroId: string
  entradaEvento?: boolean | null
  saidaEventoMateriais: MaterialEvento[]
}

type RegistrarReentradaParams = {
  registro: Registro
  operadorEmail?: string | null
  operadorNome?: string | null
}

export async function carregarDentro() {
  return await supabase
    .from('registros')
    .select('*')
    .is('hora_saida', null)
    .order('hora_entrada', { ascending: false })
}

export async function carregarSaidos(termo = '') {
  let query = supabase
    .from('registros')
    .select('*')
    .not('hora_saida', 'is', null)
    .order('hora_saida', { ascending: false })

  if (termo.trim()) {
    query = query.or(`nome.ilike.%${termo.trim()}%,documento.ilike.%${termo.trim()}%`)
  }

  return await query
}

export async function consultarRegistros({
  dataInicio,
  dataFim,
  pesquisa,
}: ConsultarRegistrosParams) {
  let query = supabase.from('registros').select('*').order('hora_entrada', { ascending: false })

  if (dataInicio) {
    query = query.gte('hora_entrada', inicioDoDiaLocalEmIso(dataInicio))
  }

  if (dataFim) {
    query = query.lte('hora_entrada', fimDoDiaLocalEmIso(dataFim))
  }

  if (pesquisa?.trim()) {
    const termo = pesquisa.trim()
    query = query.or(`nome.ilike.%${termo}%,documento.ilike.%${termo}%`)
  }

  return await query
}

export async function buscarHistoricoPorCpf(cpf: string) {
  return await supabase
    .from('registros')
    .select('nome, documento, telefone, empresa, servico, destino, responsavel, foto_url, hora_entrada')
    .eq('documento', cpf)
    .order('hora_entrada', { ascending: false })
    .limit(1)
    .maybeSingle()
}

export async function registrarSaida({
  registroId,
  entradaEvento,
  saidaEventoMateriais,
}: RegistrarSaidaParams) {
  return await supabase
    .from('registros')
    .update({
      hora_saida: new Date().toISOString(),
      ...(entradaEvento ? { evento_materiais: saidaEventoMateriais } : {}),
    })
    .eq('id', registroId)
}

export async function registrarReentrada({
  registro,
  operadorEmail,
  operadorNome,
}: RegistrarReentradaParams) {
  const novoRegistro = {
    nome: registro.nome,
    operador_entrada_email: operadorEmail || null,
    operador_entrada_nome: operadorNome || null,
    documento: registro.documento || '',
    telefone: registro.telefone || '',
    empresa: registro.empresa || '',
    servico: registro.servico || '',
    destino: registro.destino || '',
    responsavel: registro.responsavel || '',
    entrada_evento: registro.entrada_evento ?? false,
    evento_nome: registro.evento_nome || null,
    evento_os_numero: registro.evento_os_numero || null,
    evento_recebimento_em: registro.evento_recebimento_em || null,
    evento_responsavel: registro.evento_responsavel || null,
    evento_fone: registro.evento_fone || null,
    evento_lista_foto_url: registro.evento_lista_foto_url || null,
    evento_materiais: registro.evento_materiais || null,
    itens_entrada: registro.itens_entrada || null,
    hora_entrada: new Date().toISOString(),
    ...(registro.foto_url ? { foto_url: registro.foto_url } : {}),
  }

  return await supabase.from('registros').insert(novoRegistro)
}
