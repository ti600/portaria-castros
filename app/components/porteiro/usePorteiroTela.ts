'use client'

import { Dispatch, SetStateAction, useState } from 'react'

type ImagemAberta = {
  alt: string
  src: string
}

type UsePorteiroTelaResult = {
  imagemAberta: ImagemAberta | null
  setImagemAberta: Dispatch<SetStateAction<ImagemAberta | null>>
  consultaSelecionados: string[]
  setConsultaSelecionados: Dispatch<SetStateAction<string[]>>
  registrosExpandidos: string[]
  setRegistrosExpandidos: Dispatch<SetStateAction<string[]>>
  abrirImagem: (imagem: ImagemAberta) => void
  fecharImagem: () => void
  toggleConsultaSelecionado: (id: string) => void
  toggleSelecionarTodosConsulta: (idsVisiveis: string[]) => void
  toggleRegistroExpandido: (id: string) => void
}

export function usePorteiroTela(): UsePorteiroTelaResult {
  const [imagemAberta, setImagemAberta] = useState<ImagemAberta | null>(null)
  const [consultaSelecionados, setConsultaSelecionados] = useState<string[]>([])
  const [registrosExpandidos, setRegistrosExpandidos] = useState<string[]>([])

  function abrirImagem(imagem: ImagemAberta) {
    setImagemAberta(imagem)
  }

  function fecharImagem() {
    setImagemAberta(null)
  }

  function toggleConsultaSelecionado(id: string) {
    setConsultaSelecionados((atual) =>
      atual.includes(id) ? atual.filter((item) => item !== id) : [...atual, id]
    )
  }

  function toggleSelecionarTodosConsulta(idsVisiveis: string[]) {
    setConsultaSelecionados((atual) =>
      idsVisiveis.every((id) => atual.includes(id)) ? [] : idsVisiveis
    )
  }

  function toggleRegistroExpandido(id: string) {
    setRegistrosExpandidos((atual) =>
      atual.includes(id) ? atual.filter((item) => item !== id) : [...atual, id]
    )
  }

  return {
    imagemAberta,
    setImagemAberta,
    consultaSelecionados,
    setConsultaSelecionados,
    registrosExpandidos,
    setRegistrosExpandidos,
    abrirImagem,
    fecharImagem,
    toggleConsultaSelecionado,
    toggleSelecionarTodosConsulta,
    toggleRegistroExpandido,
  }
}
