'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { obterPorteirosBloqueados } from '../../lib/login-attempts'

type PorteiroBloqueado = {
  email: string
  tentativas_erradas: number
  bloqueado_ate: string
}

export function BloqueiosSection() {
  const [porteirosBloqueados, setPorteirosBloqueados] = useState<PorteiroBloqueado[]>([])
  const [carregando, setCarregando] = useState(false)
  const [desbloqueando, setDesbloqueando] = useState<string | null>(null)
  const [mensagem, setMensagem] = useState('')

  useEffect(() => {
    carregarBloqueios()
  }, [])

  async function carregarBloqueios() {
    setCarregando(true)
    try {
      const bloqueados = await obterPorteirosBloqueados()
      setPorteirosBloqueados(bloqueados as PorteiroBloqueado[])
    } catch {
      setMensagem('Erro ao carregar porteiros bloqueados')
    } finally {
      setCarregando(false)
    }
  }

  async function desbloquearPorteiro(email: string) {
    setDesbloqueando(email)
    setMensagem('')

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      const response = await fetch('/api/admin/porteiros/desbloquear', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ email }),
      })

      const resultado = await response.json()

      if (!response.ok) {
        setMensagem(`❌ Erro: ${resultado.error}`)
        return
      }

      setMensagem(`✅ ${resultado.mensagem}`)
      await carregarBloqueios()
    } catch (erro) {
      setMensagem(`❌ Erro: ${erro instanceof Error ? erro.message : 'Desconhecido'}`)
    } finally {
      setDesbloqueando(null)
    }
  }

  function calcularTempoRestante(bloqueadoAte: string): string {
    const agora = new Date()
    const bloqueio = new Date(bloqueadoAte)
    const diferenca = bloqueio.getTime() - agora.getTime()

    if (diferenca <= 0) return 'Expirado'

    const minutos = Math.floor(diferenca / 60000)
    const segundos = Math.floor((diferenca % 60000) / 1000)

    return `${minutos}m ${segundos}s`
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="mb-4 text-2xl font-bold text-[#2b1420] dark:text-[#eddde6]">Porteiros Bloqueados</h2>
        <p className="text-[#6f4358] dark:text-[#b07f97]">Gerenciar porteiros bloqueados por tentativas de login falhadas</p>
      </div>

      {mensagem && (
        <div className={`rounded-lg p-4 ${mensagem.includes('✅') ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'}`}>
          {mensagem}
        </div>
      )}

      {carregando ? (
        <div className="flex items-center justify-center py-8">
          <div className="text-[#6f4358] dark:text-[#b07f97]">Carregando...</div>
        </div>
      ) : porteirosBloqueados.length === 0 ? (
        <div className="rounded-lg border border-[#eadde3] bg-[#fffafb] p-8 text-center dark:border-[#3a1f2a] dark:bg-[#180d11]">
          <p className="text-[#6f4358] dark:text-[#b07f97]">Nenhum porteiro bloqueado no momento</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b-2 border-[#eadde3] bg-[#fff7fa] dark:border-[#3a1f2a] dark:bg-[#180d11]">
                <th className="px-6 py-3 text-left text-sm font-semibold text-[#8a2d55] dark:text-[#d47a9e]">Email</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-[#8a2d55] dark:text-[#d47a9e]">Tentativas</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-[#8a2d55] dark:text-[#d47a9e]">Tempo Restante</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-[#8a2d55] dark:text-[#d47a9e]">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f3e8ed] dark:divide-[#2a1020]">
              {porteirosBloqueados.map((porteiro) => (
                <tr key={porteiro.email} className="hover:bg-[#fffafb] dark:hover:bg-[#1e0f16]">
                  <td className="px-6 py-4 text-sm text-[#2b1420] dark:text-[#eddde6]">{porteiro.email}</td>
                  <td className="px-6 py-4 text-sm">
                    <span className="inline-block rounded-full bg-red-100 px-3 py-1 font-semibold text-red-700 dark:bg-red-900/30 dark:text-red-300">
                      {porteiro.tentativas_erradas}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-[#6f4358] dark:text-[#b07f97]">{calcularTempoRestante(porteiro.bloqueado_ate)}</td>
                  <td className="px-6 py-4 text-sm">
                    <button
                      onClick={() => desbloquearPorteiro(porteiro.email)}
                      disabled={desbloqueando === porteiro.email}
                      className="rounded bg-[#97003f] px-4 py-2 text-white hover:bg-[#7b0034] disabled:bg-[#c08aa3]"
                    >
                      {desbloqueando === porteiro.email ? 'Desbloqueando...' : 'Desbloquear'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-4">
        <button
          onClick={carregarBloqueios}
          className="rounded bg-[#97003f] px-4 py-2 text-white hover:bg-[#7b0034]"
        >
          Atualizar
        </button>
      </div>
    </div>
  )
}
