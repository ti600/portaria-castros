export function formatarData(valor?: string | null) {
  if (!valor) return '-'

  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(valor))
}

export function texto(valor?: string | null) {
  return valor && valor.trim() ? valor : '-'
}

export function limparNome(valor: string) {
  return valor.replace(/[^\p{L}\s'-]/gu, '').replace(/\s{2,}/g, ' ')
}

export function limparNumero(valor: string) {
  return valor.replace(/\D/g, '')
}

export function formatarCpf(valor?: string | null) {
  const numeros = limparNumero(valor || '').slice(0, 11)

  return numeros
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1-$2')
}

export function formatarTelefone(valor?: string | null) {
  const numeros = limparNumero(valor || '').slice(0, 11)

  if (numeros.length <= 2) return numeros
  if (numeros.length <= 7) return `(${numeros.slice(0, 2)}) ${numeros.slice(2)}`

  return `(${numeros.slice(0, 2)}) ${numeros.slice(2, 7)}-${numeros.slice(7)}`
}
