const DIMENSAO_MAXIMA = 1280
const QUALIDADE_JPEG = 0.72

type TamanhoImagem = {
  height: number
  width: number
}

function carregarImagem(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    const url = URL.createObjectURL(file)

    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve(image)
    }

    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Nao foi possivel ler a imagem selecionada.'))
    }

    image.src = url
  })
}

function calcularDimensoes(width: number, height: number): TamanhoImagem {
  if (width <= DIMENSAO_MAXIMA && height <= DIMENSAO_MAXIMA) {
    return { width, height }
  }

  const proporcao = width / height

  if (proporcao >= 1) {
    return {
      width: DIMENSAO_MAXIMA,
      height: Math.round(DIMENSAO_MAXIMA / proporcao),
    }
  }

  return {
    width: Math.round(DIMENSAO_MAXIMA * proporcao),
    height: DIMENSAO_MAXIMA,
  }
}

export async function otimizarFoto(file: File) {
  const image = await carregarImagem(file)
  const { width, height } = calcularDimensoes(image.width, image.height)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const context = canvas.getContext('2d')

  if (!context) {
    throw new Error('Nao foi possivel preparar a foto para upload.')
  }

  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, width, height)
  context.drawImage(image, 0, 0, width, height)

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, 'image/jpeg', QUALIDADE_JPEG)
  })

  if (!blob) {
    throw new Error('Nao foi possivel otimizar a foto.')
  }

  const baseName = file.name.replace(/\.[^.]+$/, '') || 'foto'

  return new File([blob], `${baseName}.jpg`, {
    type: 'image/jpeg',
    lastModified: Date.now(),
  })
}
