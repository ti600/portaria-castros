import { formatarData } from './formatters'
import { FiltroConsulta, Registro } from './registros-types'

function chaveRegistro(registro: Registro) {
  return `${(registro.documento || '').trim().toLowerCase()}::${registro.nome.trim().toLowerCase()}`
}

function ehMesmoDia(dataIso: string, referencia: Date) {
  const data = new Date(dataIso)

  return (
    data.getFullYear() === referencia.getFullYear() &&
    data.getMonth() === referencia.getMonth() &&
    data.getDate() === referencia.getDate()
  )
}

function filtrarPorNomeOuDocumento(registros: Registro[], termo: string) {
  const termoNormalizado = termo.trim().toLowerCase()

  if (!termoNormalizado) {
    return []
  }

  return registros.filter((registro) => {
    const nome = registro.nome.toLowerCase()
    const documento = (registro.documento || '').toLowerCase()
    return nome.includes(termoNormalizado) || documento.includes(termoNormalizado)
  })
}

export function resumirTexto(valor?: string | null, limite = 20) {
  const textoNormalizado = (valor || '').trim()

  if (textoNormalizado.length <= limite) {
    return textoNormalizado || '-'
  }

  return `${textoNormalizado.slice(0, limite).trimEnd()}...`
}

export function obterUltimaEntrada(dentro: Registro[], saidos: Registro[]) {
  const registrosOrdenados = [...dentro, ...saidos]
    .filter((registro) => Boolean(registro.hora_entrada))
    .sort(
      (a, b) =>
        new Date(b.hora_entrada || 0).getTime() - new Date(a.hora_entrada || 0).getTime()
    )

  if (!registrosOrdenados[0]?.hora_entrada) {
    return '-'
  }

  return formatarData(registrosOrdenados[0].hora_entrada)
}

export function obterDentroFiltrado(dentro: Registro[], buscaDentro: string) {
  return filtrarPorNomeOuDocumento(dentro, buscaDentro)
}

export function obterHospedesDentroFiltrados(dentro: Registro[], buscaHospedesDentro: string) {
  return filtrarPorNomeOuDocumento(dentro, buscaHospedesDentro)
}

export function obterSaidosFiltrados(saidos: Registro[], dentro: Registro[], buscaSaidos: string) {
  const termo = buscaSaidos.trim().toLowerCase()

  if (!termo) {
    return []
  }

  const hoje = new Date()
  const pessoasDentro = new Set(dentro.map((registro) => chaveRegistro(registro)))
  const ultimoRegistroPorPessoa = new Map<string, Registro>()

  saidos.forEach((registro) => {
    if (!registro.hora_saida || !ehMesmoDia(registro.hora_saida, hoje)) {
      return
    }

    const chave = chaveRegistro(registro)

    if (pessoasDentro.has(chave)) {
      return
    }

    const atual = ultimoRegistroPorPessoa.get(chave)

    if (!atual) {
      ultimoRegistroPorPessoa.set(chave, registro)
      return
    }

    const horaAtual = new Date(atual.hora_saida || atual.hora_entrada).getTime()
    const horaNova = new Date(registro.hora_saida || registro.hora_entrada).getTime()

    if (horaNova > horaAtual) {
      ultimoRegistroPorPessoa.set(chave, registro)
    }
  })

  return Array.from(ultimoRegistroPorPessoa.values()).filter((registro) => {
    const nome = registro.nome.toLowerCase()
    const documento = (registro.documento || '').toLowerCase()
    return nome.includes(termo) || documento.includes(termo)
  })
}

export function filtrarConsultaRegistros(
  consultaRegistros: Registro[],
  consultaFiltro: FiltroConsulta,
  idsReentrada: Set<string>
) {
  if (!consultaRegistros.length) {
    return []
  }

  if (consultaFiltro === 'todos') {
    return consultaRegistros
  }

  if (consultaFiltro === 'dentro') {
    return consultaRegistros.filter((registro) => !registro.hora_saida)
  }

  if (consultaFiltro === 'saida') {
    return consultaRegistros.filter((registro) => Boolean(registro.hora_saida))
  }

  return consultaRegistros.filter((registro) => idsReentrada.has(registro.id))
}

export function resumirConsulta(
  consultaExecutada: boolean,
  consultaFiltro: FiltroConsulta,
  consultaRegistrosFiltrados: Registro[]
) {
  if (!consultaExecutada) {
    return ''
  }

  if (!consultaRegistrosFiltrados.length) {
    return 'Nenhum registro encontrado para os filtros aplicados.'
  }

  const total = consultaRegistrosFiltrados.length
  const sufixo = total === 1 ? 'registro encontrado' : 'registros encontrados'
  const filtro =
    consultaFiltro === 'todos'
      ? 'em todos os status'
      : consultaFiltro === 'dentro'
        ? 'somente para pessoas dentro'
        : consultaFiltro === 'reentrada'
          ? 'somente para reentradas'
          : 'somente para saidas'

  return `${total} ${sufixo} ${filtro}.`
}

export function obterRegistrosSelecionadosParaExportacao(
  consultaRegistrosFiltrados: Registro[],
  consultaSelecionados: string[]
) {
  const selecionados = consultaRegistrosFiltrados.filter((registro) =>
    consultaSelecionados.includes(registro.id)
  )

  return selecionados.length ? selecionados : consultaRegistrosFiltrados
}
