type RegistroComStatus = {
  id: string
  nome: string
  documento?: string | null
  hora_entrada?: string | null
  hora_saida?: string | null
}

function chaveRegistro(registro: Pick<RegistroComStatus, 'nome' | 'documento'>) {
  return `${(registro.documento || '').trim().toLowerCase()}::${registro.nome.trim().toLowerCase()}`
}

function obterChaveDia(dataIso: string) {
  const data = new Date(dataIso)
  const ano = data.getFullYear()
  const mes = `${data.getMonth() + 1}`.padStart(2, '0')
  const dia = `${data.getDate()}`.padStart(2, '0')

  return `${ano}-${mes}-${dia}`
}

export function identificarReentradasMesmoDia<T extends RegistroComStatus>(registros: T[]) {
  const chavesReentrada = new Set<string>()
  const historico = [...registros].sort(
    (a, b) =>
      new Date(a.hora_entrada || 0).getTime() - new Date(b.hora_entrada || 0).getTime()
  )
  const saidasPorPessoaDia = new Set<string>()

  historico.forEach((registro) => {
    if (!registro.hora_entrada) {
      return
    }

    const chave = chaveRegistro(registro)
    const diaEntrada = obterChaveDia(registro.hora_entrada)
    const chavePessoaDia = `${chave}::${diaEntrada}`

    if (saidasPorPessoaDia.has(chavePessoaDia)) {
      chavesReentrada.add(registro.id)
    }

    if (registro.hora_saida) {
      const diaSaida = obterChaveDia(registro.hora_saida)
      saidasPorPessoaDia.add(`${chave}::${diaSaida}`)
    }
  })

  return chavesReentrada
}

export function obterSituacaoRegistro(
  registro: Pick<RegistroComStatus, 'id' | 'hora_saida'>,
  idsReentrada: Set<string>
) {
  if (!registro.hora_saida) return 'Dentro'
  if (idsReentrada.has(registro.id)) return 'Reentrada'
  return 'Saida'
}
