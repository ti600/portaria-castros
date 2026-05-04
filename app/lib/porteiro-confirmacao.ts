import { ConfirmacaoAcao, MaterialEvento, Registro } from './registros-types'

export function prepararMateriaisSaidaEvento(registro: Registro): MaterialEvento[] {
  return (registro.evento_materiais || []).map((material, index) => ({
    id: material.id || `material-${index}`,
    quantidade: material.quantidade || '',
    discriminacao: material.discriminacao || '',
    data: material.data || '',
    quantidadeSaida: material.quantidadeSaida || '',
    observacoes: material.observacoes || '',
  }))
}

export function montarEstadoConfirmacaoSaida(registro: Registro): {
  saidaEventoMateriais: MaterialEvento[]
  confirmacaoAcao: ConfirmacaoAcao
} {
  return {
    saidaEventoMateriais: prepararMateriaisSaidaEvento(registro),
    confirmacaoAcao: { tipo: 'saida', registro },
  }
}

export function atualizarQuantidadeSaidaMaterial(
  materiais: MaterialEvento[],
  materialId: string,
  valor: string
) {
  return materiais.map((material) =>
    material.id === materialId ? { ...material, quantidadeSaida: valor } : material
  )
}
