'use client'

import { useEffect, useState } from 'react'

export function ThemeToggle() {
  const [escuro, setEscuro] = useState(false)

  useEffect(() => {
    // Re-aplica o tema do localStorage caso tenha navegado via client-side (ex: vindo da tela de login)
    const classeEscuro = document.documentElement.classList.contains('dark')
    if (!classeEscuro) {
      try {
        if (localStorage.getItem('tema') === 'escuro') {
          document.documentElement.classList.add('dark')
          setEscuro(true)
          return
        }
      } catch (_) {}
    }
    setEscuro(classeEscuro)
  }, [])

  function alternar() {
    const novoEscuro = !escuro
    setEscuro(novoEscuro)
    if (novoEscuro) {
      document.documentElement.classList.add('dark')
      localStorage.setItem('tema', 'escuro')
    } else {
      document.documentElement.classList.remove('dark')
      localStorage.setItem('tema', 'claro')
    }
  }

  return (
    <button
      type="button"
      onClick={alternar}
      title={escuro ? 'Mudar para modo claro' : 'Mudar para modo escuro'}
      className="rounded-md border border-[#d7b8c7] bg-white px-3 py-2 text-sm font-bold text-[#97003f] transition hover:bg-[#fff0f6] dark:border-[#4a2a38] dark:bg-[#1c1014] dark:text-[#f07a9e] dark:hover:bg-[#2a1520]"
    >
      {escuro ? '☀ Claro' : '☾ Escuro'}
    </button>
  )
}
