'use client'

import { Dispatch, SetStateAction, useCallback, useState } from 'react'
import { limparNumero } from '../../lib/formatters'
import { FormularioEvento, MaterialEvento } from '../../lib/registros-types'

type UseEventoEntradaParams = {
  formularioEventoInicial: FormularioEvento
  criarMaterialEvento: () => MaterialEvento
  onFecharModal?: () => void
}

type UseEventoEntradaResult = {
  eventoForm: FormularioEvento
  setEventoForm: Dispatch<SetStateAction<FormularioEvento>>
  eventoListaFoto: File | null
  setEventoListaFoto: Dispatch<SetStateAction<File | null>>
  eventoListaFotoPreview: string
  setEventoListaFotoPreview: Dispatch<SetStateAction<string>>
  eventoListaFotoNome: string
  setEventoListaFotoNome: Dispatch<SetStateAction<string>>
  eventoListaFotoTipo: string
  setEventoListaFotoTipo: Dispatch<SetStateAction<string>>
  alterarCampoEvento: (campo: Exclude<keyof FormularioEvento, 'materiais'>, valor: string) => void
  alterarMaterialEvento: (
    materialId: string,
    campo: Exclude<keyof MaterialEvento, 'id'>,
    valor: string
  ) => void
  adicionarMaterialEvento: () => void
  removerMaterialEvento: (materialId: string) => void
  limparListaEvento: () => void
  resetarEvento: (fecharModal?: boolean) => void
}

export function useEventoEntrada({
  formularioEventoInicial,
  criarMaterialEvento,
  onFecharModal,
}: UseEventoEntradaParams): UseEventoEntradaResult {
  const [eventoForm, setEventoForm] = useState<FormularioEvento>(formularioEventoInicial)
  const [eventoListaFoto, setEventoListaFoto] = useState<File | null>(null)
  const [eventoListaFotoPreview, setEventoListaFotoPreview] = useState('')
  const [eventoListaFotoNome, setEventoListaFotoNome] = useState('')
  const [eventoListaFotoTipo, setEventoListaFotoTipo] = useState('')

  const limparListaEvento = useCallback(() => {
    if (eventoListaFotoPreview.startsWith('blob:')) {
      URL.revokeObjectURL(eventoListaFotoPreview)
    }

    setEventoListaFoto(null)
    setEventoListaFotoPreview('')
    setEventoListaFotoNome('')
    setEventoListaFotoTipo('')
  }, [eventoListaFotoPreview])

  const resetarEvento = useCallback((fecharModal = true) => {
    setEventoForm({
      ...formularioEventoInicial,
      materiais: [criarMaterialEvento()],
    })
    limparListaEvento()

    if (fecharModal) {
      onFecharModal?.()
    }
  }, [criarMaterialEvento, formularioEventoInicial, limparListaEvento, onFecharModal])

  function alterarCampoEvento(campo: Exclude<keyof FormularioEvento, 'materiais'>, valor: string) {
    const proximoValor = campo === 'fone' ? limparNumero(valor) : valor
    setEventoForm((atual) => ({ ...atual, [campo]: proximoValor }))
  }

  function alterarMaterialEvento(
    materialId: string,
    campo: Exclude<keyof MaterialEvento, 'id'>,
    valor: string
  ) {
    setEventoForm((atual) => ({
      ...atual,
      materiais: atual.materiais.map((material) =>
        material.id === materialId ? { ...material, [campo]: valor } : material
      ),
    }))
  }

  function adicionarMaterialEvento() {
    setEventoForm((atual) => ({
      ...atual,
      materiais: [...atual.materiais, criarMaterialEvento()],
    }))
  }

  function removerMaterialEvento(materialId: string) {
    setEventoForm((atual) => ({
      ...atual,
      materiais:
        atual.materiais.length === 1
          ? [criarMaterialEvento()]
          : atual.materiais.filter((material) => material.id !== materialId),
    }))
  }

  return {
    eventoForm,
    setEventoForm,
    eventoListaFoto,
    setEventoListaFoto,
    eventoListaFotoPreview,
    setEventoListaFotoPreview,
    eventoListaFotoNome,
    setEventoListaFotoNome,
    eventoListaFotoTipo,
    setEventoListaFotoTipo,
    alterarCampoEvento,
    alterarMaterialEvento,
    adicionarMaterialEvento,
    removerMaterialEvento,
    limparListaEvento,
    resetarEvento,
  }
}
