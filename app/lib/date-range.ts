export function inicioDoDiaLocalEmIso(data: string) {
  const [ano, mes, dia] = data.split('-').map(Number)
  return new Date(ano, (mes || 1) - 1, dia || 1, 0, 0, 0, 0).toISOString()
}

export function fimDoDiaLocalEmIso(data: string) {
  const [ano, mes, dia] = data.split('-').map(Number)
  return new Date(ano, (mes || 1) - 1, dia || 1, 23, 59, 59, 999).toISOString()
}
