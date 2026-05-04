import { FormularioEntrada, FormularioEvento, MaterialEvento, Usuario } from './registros-types'

function normalizarTexto(valor?: string | null) {
  return (valor || '').trim()
}

export function filtrarMateriaisEventoPreenchidos(materiais: MaterialEvento[]) {
  return materiais.filter(
    (material) =>
      normalizarTexto(material.quantidade) ||
      normalizarTexto(material.discriminacao) ||
      normalizarTexto(material.data) ||
      normalizarTexto(material.observacoes)
  )
}

export function formatarItensEvento(materiais: MaterialEvento[]) {
  return filtrarMateriaisEventoPreenchidos(materiais)
    .map((material) => {
      const partes = [
        normalizarTexto(material.quantidade) ? `${normalizarTexto(material.quantidade)}x` : '',
        normalizarTexto(material.discriminacao),
        normalizarTexto(material.data)
          ? `(${new Intl.DateTimeFormat('pt-BR').format(new Date(`${material.data}T00:00:00`))})`
          : '',
        normalizarTexto(material.observacoes) ? `- ${normalizarTexto(material.observacoes)}` : '',
      ].filter(Boolean)

      return partes.join(' ')
    })
    .join(' | ')
}

export function montarResumoItensEntradaEvento(
  entradaEvento: FormularioEntrada['entradaEvento'],
  listaEventoUrl: string | null,
  materiaisEvento: MaterialEvento[]
) {
  if (entradaEvento !== 'sim') {
    return null
  }

  if (listaEventoUrl) {
    return materiaisEvento.length
      ? `Lista de materiais anexada por foto. ${formatarItensEvento(materiaisEvento)}`
      : 'Lista de materiais anexada por foto.'
  }

  return formatarItensEvento(materiaisEvento)
}

type MontarPayloadEntradaParams = {
  form: FormularioEntrada
  eventoForm: FormularioEvento
  usuario: Usuario | null
  fotoRegistroUrl: string | null
  listaEventoUrl: string | null
  materiaisEvento: MaterialEvento[]
  itensEventoResumo: string | null
  horaEntrada: string
}

export function montarPayloadEntrada({
  form,
  eventoForm,
  usuario,
  fotoRegistroUrl,
  listaEventoUrl,
  materiaisEvento,
  itensEventoResumo,
  horaEntrada,
}: MontarPayloadEntradaParams) {
  return {
    nome: normalizarTexto(form.nome),
    operador_entrada_email: usuario?.email || null,
    operador_entrada_nome: usuario?.nome || null,
    documento: normalizarTexto(form.documento),
    telefone: normalizarTexto(form.telefone),
    contato_emergencia: normalizarTexto(form.contatoEmergencia) || null,
    empresa: normalizarTexto(form.empresa),
    servico: normalizarTexto(form.servico),
    destino: normalizarTexto(form.destino),
    responsavel: normalizarTexto(form.responsavel),
    entrada_evento: form.entradaEvento === 'sim',
    evento_nome: form.entradaEvento === 'sim' ? normalizarTexto(eventoForm.nome) : null,
    evento_os_numero: form.entradaEvento === 'sim' ? normalizarTexto(eventoForm.osNumero) : null,
    evento_recebimento_em:
      form.entradaEvento === 'sim' ? normalizarTexto(eventoForm.recebimentoEm) : null,
    evento_responsavel:
      form.entradaEvento === 'sim' ? normalizarTexto(eventoForm.responsavel) : null,
    evento_fone: form.entradaEvento === 'sim' ? normalizarTexto(eventoForm.fone) : null,
    evento_lista_foto_url: form.entradaEvento === 'sim' ? listaEventoUrl : null,
    evento_materiais: form.entradaEvento === 'sim' ? materiaisEvento : null,
    itens_entrada: itensEventoResumo,
    hora_entrada: horaEntrada,
    ...(fotoRegistroUrl ? { foto_url: fotoRegistroUrl } : {}),
  }
}
