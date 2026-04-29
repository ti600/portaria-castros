import { jsPDF } from 'jspdf'
import * as XLSX from 'xlsx'

type RegistroRelatorio = {
  destino?: string | null
  documento?: string | null
  entrada_evento?: boolean | null
  empresa?: string | null
  evento_fone?: string | null
  evento_lista_foto_url?: string | null
  evento_nome?: string | null
  evento_os_numero?: string | null
  evento_recebimento_em?: string | null
  evento_responsavel?: string | null
  foto_url?: string | null
  hora_entrada?: string | null
  hora_saida?: string | null
  itens_entrada?: string | null
  nome: string
  operador_entrada_email?: string | null
  operador_entrada_nome?: string | null
  responsavel?: string | null
  servico?: string | null
  telefone?: string | null
}

function limparTexto(valor?: string | null) {
  return (valor || '').replace(/[\r\n\t]+/g, ' ').trim()
}

function limparNumero(valor: string) {
  return valor.replace(/\D/g, '')
}

function formatarCpf(valor?: string | null) {
  const numeros = limparNumero(valor || '').slice(0, 11)

  return numeros
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1-$2')
}

function formatarTelefone(valor?: string | null) {
  const numeros = limparNumero(valor || '').slice(0, 11)

  if (numeros.length <= 2) return numeros
  if (numeros.length <= 7) return `(${numeros.slice(0, 2)}) ${numeros.slice(2)}`

  return `(${numeros.slice(0, 2)}) ${numeros.slice(2, 7)}-${numeros.slice(7)}`
}

function formatarData(valor?: string | null) {
  if (!valor) return '-'
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(valor))
}

function baixarBlob(blob: Blob, nome: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = nome
  link.click()
  URL.revokeObjectURL(url)
}

async function urlParaDataUrl(url: string) {
  const response = await fetch(url)
  const blob = await response.blob()

  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('Nao foi possivel carregar a imagem.'))
    reader.readAsDataURL(blob)
  })
}

async function carregarLogo() {
  try {
    return await urlParaDataUrl('/castros-logo-bordo.png')
  } catch {
    return null
  }
}

function desenharCabecalho(doc: jsPDF, logo: string | null, pagina: number, totalPaginas: number) {
  doc.setFillColor(151, 0, 63)
  doc.rect(0, 0, 210, 28, 'F')

  if (logo) {
    doc.addImage(logo, 'PNG', 12, 5, 18, 18)
  }

  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.text("CASTRO'S PARK HOTEL", 35, 13)
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.text('Relatorio de Portaria', 35, 20)
  doc.text(`Pagina ${pagina} de ${totalPaginas}`, 175, 20, { align: 'right' })
}

function desenharRodape(doc: jsPDF) {
  doc.setDrawColor(215, 184, 199)
  doc.line(12, 287, 198, 287)
  doc.setTextColor(111, 67, 88)
  doc.setFontSize(9)
  doc.text(
    `Gerado em ${new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date())}`,
    12,
    292
  )
}

async function obterImagem(cache: Map<string, string | null>, url?: string | null) {
  if (!url) return null

  let imagem = cache.get(url) || null

  if (!imagem) {
    try {
      imagem = await urlParaDataUrl(url)
      cache.set(url, imagem)
    } catch {
      imagem = null
    }
  }

  return imagem
}

function quebrarTexto(doc: jsPDF, valor: string, largura: number) {
  return doc.splitTextToSize(valor || '-', largura)
}

export function exportarRelatorioExcel(registros: RegistroRelatorio[]) {
  const linhas = registros.map((registro) => ({
    Nome: limparTexto(registro.nome),
    CPF: formatarCpf(registro.documento),
    Telefone: formatarTelefone(registro.telefone),
    Empresa: limparTexto(registro.empresa),
    Servico: limparTexto(registro.servico),
    Destino: limparTexto(registro.destino),
    Evento: registro.entrada_evento ? limparTexto(registro.evento_nome) : '',
    OS: registro.entrada_evento ? limparTexto(registro.evento_os_numero) : '',
    Recebimento: registro.entrada_evento ? limparTexto(registro.evento_recebimento_em) : '',
    Responsavel_Evento: registro.entrada_evento ? limparTexto(registro.evento_responsavel) : '',
    Fone_Evento: registro.entrada_evento ? limparTexto(registro.evento_fone) : '',
    Itens: registro.entrada_evento ? limparTexto(registro.itens_entrada) : '',
    Responsavel: limparTexto(registro.responsavel),
    Operador_Entrada: limparTexto(registro.operador_entrada_nome),
    Email_Operador_Entrada: limparTexto(registro.operador_entrada_email),
    Entrada: formatarData(registro.hora_entrada),
    Saida: formatarData(registro.hora_saida),
    Foto_Visitante: registro.foto_url || '',
    Anexo_Evento: registro.evento_lista_foto_url || '',
  }))

  const worksheet = XLSX.utils.json_to_sheet(linhas)
  worksheet['!cols'] = [
    { wch: 28 },
    { wch: 18 },
    { wch: 16 },
    { wch: 22 },
    { wch: 20 },
    { wch: 20 },
    { wch: 24 },
    { wch: 18 },
    { wch: 18 },
    { wch: 24 },
    { wch: 18 },
    { wch: 42 },
    { wch: 24 },
    { wch: 24 },
    { wch: 30 },
    { wch: 22 },
    { wch: 22 },
    { wch: 38 },
    { wch: 38 },
  ]

  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Portaria')
  XLSX.writeFile(workbook, `relatorio-portaria-${Date.now()}.xlsx`)
}

export async function exportarRelatorioPdf(registros: RegistroRelatorio[]) {
  const doc = new jsPDF({
    format: 'a4',
    unit: 'mm',
  })

  const logo = await carregarLogo()
  const fotoCache = new Map<string, string | null>()
  const totalPaginas = Math.max(
    1,
    registros.reduce(
      (total, registro) => total + (registro.evento_lista_foto_url ? 2 : 1),
      0
    )
  )
  let paginaAtual = 0

  for (let index = 0; index < registros.length; index += 1) {
    const registro = registros[index]

    if (paginaAtual > 0) {
      doc.addPage()
    }

    paginaAtual += 1
    desenharCabecalho(doc, logo, paginaAtual, totalPaginas)

    doc.setDrawColor(234, 221, 227)
    doc.setFillColor(255, 250, 251)
    doc.roundedRect(12, 34, 186, 238, 4, 4, 'FD')

    doc.setTextColor(43, 20, 32)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(16)
    doc.text(registro.nome || '-', 20, 48)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10.5)

    const detalhes = [
      ['CPF', formatarCpf(registro.documento) || '-'],
      ['Telefone', formatarTelefone(registro.telefone) || '-'],
      ['Empresa', limparTexto(registro.empresa) || '-'],
      ['Servico', limparTexto(registro.servico) || '-'],
      ['Destino', limparTexto(registro.destino) || '-'],
      ['Responsavel', limparTexto(registro.responsavel) || '-'],
      ['Operador da entrada', limparTexto(registro.operador_entrada_nome) || '-'],
      ['Email do operador', limparTexto(registro.operador_entrada_email) || '-'],
      ['Evento', registro.entrada_evento ? limparTexto(registro.evento_nome) || '-' : 'Nao'],
      ['OS numero', registro.entrada_evento ? limparTexto(registro.evento_os_numero) || '-' : '-'],
      ['Recebimento', registro.entrada_evento ? limparTexto(registro.evento_recebimento_em) || '-' : '-'],
      ['Responsavel evento', registro.entrada_evento ? limparTexto(registro.evento_responsavel) || '-' : '-'],
      ['Fone evento', registro.entrada_evento ? formatarTelefone(registro.evento_fone) || '-' : '-'],
      ['Itens', registro.entrada_evento ? limparTexto(registro.itens_entrada) || '-' : '-'],
      ['Entrada', formatarData(registro.hora_entrada)],
      ['Saida', formatarData(registro.hora_saida)],
    ] as const

    let cursorY = 60
    detalhes.forEach(([rotulo, valor]) => {
      const linhas = quebrarTexto(doc, valor, 132)
      doc.setTextColor(138, 45, 85)
      doc.setFont('helvetica', 'bold')
      doc.text(`${rotulo}:`, 20, cursorY)
      doc.setTextColor(43, 20, 32)
      doc.setFont('helvetica', 'normal')
      doc.text(linhas, 58, cursorY)
      cursorY += Math.max(8, linhas.length * 5)
    })

    const fotoVisitante = await obterImagem(fotoCache, registro.foto_url)

    doc.setTextColor(138, 45, 85)
    doc.setFont('helvetica', 'bold')
    doc.text('Foto do visitante', 20, cursorY + 6)

    doc.setDrawColor(215, 184, 199)
    doc.setFillColor(255, 255, 255)
    doc.roundedRect(20, cursorY + 12, 170, 74, 3, 3, 'FD')

    if (fotoVisitante) {
      doc.addImage(fotoVisitante, 'JPEG', 24, cursorY + 16, 162, 66)
    } else {
      doc.setTextColor(111, 67, 88)
      doc.setFont('helvetica', 'normal')
      doc.text(
        registro.foto_url
          ? 'Nao foi possivel carregar a foto do visitante.'
          : 'Este registro nao possui foto do visitante.',
        24,
        cursorY + 49
      )
    }

    desenharRodape(doc)

    if (registro.evento_lista_foto_url) {
      doc.addPage()
      paginaAtual += 1
      desenharCabecalho(doc, logo, paginaAtual, totalPaginas)

      doc.setDrawColor(234, 221, 227)
      doc.setFillColor(255, 250, 251)
      doc.roundedRect(12, 34, 186, 238, 4, 4, 'FD')

      doc.setTextColor(43, 20, 32)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(16)
      doc.text(`Anexo do evento - ${registro.nome || '-'}`, 20, 50)
      doc.setFontSize(11)
      doc.setFont('helvetica', 'normal')
      doc.text(`Evento: ${limparTexto(registro.evento_nome) || '-'}`, 20, 62)
      doc.text(`CPF: ${formatarCpf(registro.documento) || '-'}`, 20, 70)

      doc.setTextColor(138, 45, 85)
      doc.setFont('helvetica', 'bold')
      doc.text('Lista anexada', 20, 84)

      doc.setDrawColor(215, 184, 199)
      doc.setFillColor(255, 255, 255)
      doc.roundedRect(20, 90, 170, 160, 3, 3, 'FD')

      const anexoEvento = await obterImagem(fotoCache, registro.evento_lista_foto_url)

      if (anexoEvento) {
        doc.addImage(anexoEvento, 'JPEG', 24, 94, 162, 152)
      } else {
        doc.setTextColor(111, 67, 88)
        doc.setFont('helvetica', 'normal')
        doc.text('Nao foi possivel carregar o anexo do evento.', 24, 170)
      }

      desenharRodape(doc)
    }
  }

  if (!registros.length) {
    desenharCabecalho(doc, logo, 1, 1)
    doc.setTextColor(43, 20, 32)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(16)
    doc.text('Relatorio de Portaria', 20, 48)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(11)
    doc.text('Nenhum registro encontrado para exportacao.', 20, 64)
    desenharRodape(doc)
  }

  const blob = doc.output('blob')
  baixarBlob(blob, `relatorio-portaria-${Date.now()}.pdf`)
}
