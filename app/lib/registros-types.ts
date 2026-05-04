export type Perfil = 'admin' | 'porteiro'

export type Usuario = {
  id: string
  nome: string
  email: string
  perfil: Perfil
  ativo?: boolean | null
}

export type MaterialEvento = {
  id: string
  quantidade: string
  discriminacao: string
  data: string
  quantidadeSaida: string
  observacoes: string
}

export type FormularioEvento = {
  nome: string
  osNumero: string
  recebimentoEm: string
  responsavel: string
  fone: string
  materiais: MaterialEvento[]
}

export type FormularioEntrada = {
  tipoDocumento: 'cpf' | 'rg'
  nome: string
  documento: string
  telefone: string
  contatoEmergencia: string
  empresa: string
  servico: string
  destino: string
  responsavel: string
  entradaEvento: '' | 'sim' | 'nao'
  eventoNome: string
  itensEntrada: string
}

export type Registro = {
  id: string
  nome: string
  operador_entrada_email?: string | null
  operador_entrada_nome?: string | null
  documento?: string | null
  telefone?: string | null
  contato_emergencia?: string | null
  empresa?: string | null
  servico?: string | null
  destino?: string | null
  responsavel?: string | null
  entrada_evento?: boolean | null
  evento_nome?: string | null
  evento_os_numero?: string | null
  evento_recebimento_em?: string | null
  evento_responsavel?: string | null
  evento_fone?: string | null
  evento_lista_foto_url?: string | null
  evento_materiais?: MaterialEvento[] | null
  itens_entrada?: string | null
  tipo_documento?: string | null
  foto_url?: string | null
  hora_entrada: string
  hora_saida?: string | null
}

export type ConfirmacaoAcao =
  | { tipo: 'saida'; registro: Registro }
  | { tipo: 'reentrada'; registro: Registro }

export type FiltroConsulta = 'todos' | 'dentro' | 'reentrada' | 'saida'
