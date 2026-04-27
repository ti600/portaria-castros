import { jsPDF } from 'jspdf'
import * as XLSX from 'xlsx'

type RegistroRelatorio = {
  destino?: string | null
  documento?: string | null
  empresa?: string | null
  foto_url?: string | null
  hora_entrada?: string | null
  hora_saida?: string | null
  nome: string
  responsavel?: string | null
  servico?: string | null
  telefone?: string | null
}

function limparTexto(valor?: string | null) {
  return (valor || '').replace(/[\r\n\t]+/g, ' ').trim()
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

export function exportarRelatorioExcel(registros: RegistroRelatorio[]) {
  const linhas = registros.map((registro) => ({
    Nome: limparTexto(registro.nome),
    Documento: limparTexto(registro.documento),
    Telefone: limparTexto(registro.telefone),
    Empresa: limparTexto(registro.empresa),
    Servico: limparTexto(registro.servico),
    Destino: limparTexto(registro.destino),
    Responsavel: limparTexto(registro.responsavel),
    Entrada: formatarData(registro.hora_entrada),
    Saida: formatarData(registro.hora_saida),
    Foto: registro.foto_url || '',
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
    { wch: 22 },
    { wch: 22 },
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
  const totalPaginas = Math.max(1, registros.length)

  for (let index = 0; index < registros.length; index += 1) {
    if (index > 0) {
      doc.addPage()
    }

    const registro = registros[index]
    desenharCabecalho(doc, logo, index + 1, totalPaginas)

    doc.setDrawColor(234, 221, 227)
    doc.setFillColor(255, 250, 251)
    doc.roundedRect(12, 34, 186, 238, 4, 4, 'FD')

    doc.setTextColor(43, 20, 32)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(16)
    doc.text(registro.nome || '-', 20, 48)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(11)

    const detalhes = [
      ['Documento', limparTexto(registro.documento) || '-'],
      ['Telefone', limparTexto(registro.telefone) || '-'],
      ['Empresa', limparTexto(registro.empresa) || '-'],
      ['Servico', limparTexto(registro.servico) || '-'],
      ['Destino', limparTexto(registro.destino) || '-'],
      ['Responsavel', limparTexto(registro.responsavel) || '-'],
      ['Entrada', formatarData(registro.hora_entrada)],
      ['Saida', formatarData(registro.hora_saida)],
    ]

    let cursorY = 62
    detalhes.forEach(([rotulo, valor]) => {
      doc.setTextColor(138, 45, 85)
      doc.setFont('helvetica', 'bold')
      doc.text(`${rotulo}:`, 20, cursorY)
      doc.setTextColor(43, 20, 32)
      doc.setFont('helvetica', 'normal')
      doc.text(valor, 54, cursorY)
      cursorY += 12
    })

    doc.setTextColor(138, 45, 85)
    doc.setFont('helvetica', 'bold')
    doc.text('Foto do visitante', 20, 165)

    doc.setDrawColor(215, 184, 199)
    doc.setFillColor(255, 255, 255)
    doc.roundedRect(20, 172, 170, 88, 3, 3, 'FD')

    if (registro.foto_url) {
      let imagem = fotoCache.get(registro.foto_url) || null

      if (!imagem) {
        try {
          imagem = await urlParaDataUrl(registro.foto_url)
          fotoCache.set(registro.foto_url, imagem)
        } catch {
          imagem = null
        }
      }

      if (imagem) {
        doc.addImage(imagem, 'JPEG', 24, 176, 162, 80)
      } else {
        doc.setTextColor(111, 67, 88)
        doc.setFont('helvetica', 'normal')
        doc.text('Nao foi possivel carregar a foto para o PDF.', 24, 220)
      }
    } else {
      doc.setTextColor(111, 67, 88)
      doc.setFont('helvetica', 'normal')
      doc.text('Este registro nao possui foto anexada.', 24, 220)
    }

    desenharRodape(doc)
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
