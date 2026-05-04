import { Dispatch, SetStateAction } from 'react'

type Setter<T> = Dispatch<SetStateAction<T>>

type ProcessarArquivoVisitanteParams = {
  arquivo: File | null
  fotoPreview: string
  tamanhoMaximoFoto: number
  limparFoto: () => void
  setFoto: Setter<File | null>
  setFotoPreview: Setter<string>
  setErro: Setter<string>
}

type ProcessarArquivoListaEventoParams = {
  arquivo: File | null
  tamanhoMaximoFoto: number
  limparListaEvento: () => void
  setEventoListaFoto: Setter<File | null>
  setEventoListaFotoPreview: Setter<string>
  setEventoListaFotoNome: Setter<string>
  setEventoListaFotoTipo: Setter<string>
  setErro: Setter<string>
}

export function revogarPreviewTemporario(preview: string) {
  if (preview.startsWith('blob:')) {
    URL.revokeObjectURL(preview)
  }
}

export async function lerArquivoComoDataUrl(arquivo: File) {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('Nao foi possivel gerar a pre-visualizacao da imagem.'))
    reader.readAsDataURL(arquivo)
  })
}

export function processarArquivoVisitante({
  arquivo,
  fotoPreview,
  tamanhoMaximoFoto,
  limparFoto,
  setFoto,
  setFotoPreview,
  setErro,
}: ProcessarArquivoVisitanteParams) {
  setErro('')

  if (!arquivo) {
    limparFoto()
    return
  }

  if (!arquivo.type.startsWith('image/')) {
    limparFoto()
    setErro('Selecione um arquivo de imagem.')
    return
  }

  if (arquivo.size > tamanhoMaximoFoto) {
    limparFoto()
    setErro('A foto deve ter no maximo 5 MB.')
    return
  }

  revogarPreviewTemporario(fotoPreview)
  setFoto(arquivo)
  setFotoPreview(URL.createObjectURL(arquivo))
}

export async function processarArquivoListaEvento({
  arquivo,
  tamanhoMaximoFoto,
  limparListaEvento,
  setEventoListaFoto,
  setEventoListaFotoPreview,
  setEventoListaFotoNome,
  setEventoListaFotoTipo,
  setErro,
}: ProcessarArquivoListaEventoParams) {
  setErro('')

  if (!arquivo) {
    limparListaEvento()
    return
  }

  if (!arquivo.type.startsWith('image/') && arquivo.type !== 'application/pdf') {
    limparListaEvento()
    setErro('Selecione uma imagem ou PDF valido para a lista de materiais.')
    return
  }

  if (arquivo.size > tamanhoMaximoFoto) {
    limparListaEvento()
    setErro('O anexo da lista deve ter no maximo 5 MB.')
    return
  }

  setEventoListaFoto(arquivo)
  setEventoListaFotoNome(arquivo.name)
  setEventoListaFotoTipo(arquivo.type)

  try {
    if (arquivo.type === 'application/pdf') {
      setEventoListaFotoPreview(URL.createObjectURL(arquivo))
    } else {
      setEventoListaFotoPreview(await lerArquivoComoDataUrl(arquivo))
    }
  } catch (error) {
    limparListaEvento()
    setErro(
      error instanceof Error
        ? error.message
        : 'Nao foi possivel gerar a pre-visualizacao da lista do evento.'
    )
  }
}
