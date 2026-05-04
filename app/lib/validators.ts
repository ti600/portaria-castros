/**
 * Valida CPF usando o algoritmo oficial de verificação
 * Verifica os dois dígitos verificadores
 */
export function validarCPF(cpf: string): boolean {
  // Remove caracteres especiais
  const cpfLimpo = cpf.replace(/\D/g, '')

  // Verifica se tem 11 dígitos
  if (cpfLimpo.length !== 11) {
    return false
  }

  // Rejeita CPFs com todos os dígitos iguais
  if (/^(\d)\1{10}$/.test(cpfLimpo)) {
    return false
  }

  // Calcula primeiro dígito verificador
  let soma = 0
  let multiplicador = 10

  for (let i = 0; i < 9; i++) {
    soma += parseInt(cpfLimpo.charAt(i)) * multiplicador
    multiplicador--
  }

  let resto = soma % 11
  const digito1 = resto < 2 ? 0 : 11 - resto

  if (parseInt(cpfLimpo.charAt(9)) !== digito1) {
    return false
  }

  // Calcula segundo dígito verificador
  soma = 0
  multiplicador = 11

  for (let i = 0; i < 10; i++) {
    soma += parseInt(cpfLimpo.charAt(i)) * multiplicador
    multiplicador--
  }

  resto = soma % 11
  const digito2 = resto < 2 ? 0 : 11 - resto

  if (parseInt(cpfLimpo.charAt(10)) !== digito2) {
    return false
  }

  return true
}

/**
 * Sanitiza entrada de texto removendo caracteres perigosos
 */
export function sanitizarTexto(texto: string, maxLength: number = 255): string {
  if (!texto) return ''

  // Remove caracteres de controle e especiais perigosos
  let sanitizado = texto
    .replace(/[<>\"']/g, '') // Remove quotes e brackets
    .replace(/javascript:/gi, '') // Remove javascript:
    .replace(/on\w+=/gi, '') // Remove event handlers (onclick=, etc)
    .substring(0, maxLength) // Limita tamanho
    .trim()

  return sanitizado
}

/**
 * Sanitiza email removendo caracteres inválidos
 */
export function sanitizarEmail(email: string): string {
  if (!email) return ''

  const emailLimpo = email
    .toLowerCase()
    .trim()
    .replace(/[<>\"']/g, '')

  // Valida formato básico
  const regexEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!regexEmail.test(emailLimpo)) {
    return ''
  }

  return emailLimpo
}

/**
 * Sanitiza telefone mantendo apenas números
 */
export function sanitizarTelefone(telefone: string): string {
  if (!telefone) return ''

  const telefoneLimpo = telefone.replace(/\D/g, '')

  // Valida se tem 11 dígitos (DDD + 9 dígitos)
  if (telefoneLimpo.length !== 11) {
    return ''
  }

  return telefoneLimpo
}

/**
 * Valida se o nome tem pelo menos 3 caracteres e sem números
 */
export function validarNome(nome: string): boolean {
  const nomeLimpo = sanitizarTexto(nome)

  if (nomeLimpo.length < 3) {
    return false
  }

  // Não permite números
  if (/\d/.test(nomeLimpo)) {
    return false
  }

  return true
}
