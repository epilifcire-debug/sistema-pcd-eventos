// Cálculos dos relatórios (funções puras)
import { minutosDoDia, hhmm, normalizar, soDigitos } from './utils.js'

const contaNoEvento = (i) => i.status === 'ativa' || (i.motivo_cancelamento && i.motivo_cancelamento !== 'manual')

// Tabela de picos de acesso a partir das inscrições de um evento
export function calcularPicos(inscricoes, intervalo = 30) {
  const conf = inscricoes.filter((i) => i.conferido)
  const comHora = conf.filter((i) => i.conferido_em).map((i) => i.conferido_em).sort()
  const semHorario = conf.length - comHora.length
  if (comHora.length === 0) return { total: conf.length, comHorario: 0, semHorario, faixas: [], top: [], pico: null, primeira: null, ultima: null }

  // minuto absoluto no horário local (eventos que passam da meia-noite continuam em ordem)
  const minutoLocal = (iso) => {
    const abs = Math.floor(new Date(iso).getTime() / 60000)
    let off = minutosDoDia(iso) - (((abs % 1440) + 1440) % 1440)
    if (off > 720) off -= 1440
    if (off < -720) off += 1440
    return abs + off
  }
  const cont = new Map()
  for (const iso of comHora) {
    const b = Math.floor(minutoLocal(iso) / intervalo) * intervalo
    cont.set(b, (cont.get(b) || 0) + 1)
  }
  const chaves = [...cont.keys()]
  const ini = Math.min(...chaves)
  const fim = Math.max(...chaves)
  const faixas = []
  let acum = 0
  for (let b = ini; b <= fim; b += intervalo) {
    const qtd = cont.get(b) || 0
    acum += qtd
    faixas.push({
      inicio: b,
      rotulo: `${hhmm(b % 1440)} – ${hhmm((b + intervalo - 1) % 1440)}`,
      qtd,
      pct: (qtd / comHora.length) * 100,
      acumulado: acum,
    })
  }
  const top = [...faixas].filter((f) => f.qtd > 0).sort((a, b) => b.qtd - a.qtd || a.inicio - b.inicio).slice(0, 3).map((f) => f.inicio)
  const maior = faixas.find((f) => f.inicio === top[0])
  return {
    total: conf.length, comHorario: comHora.length, semHorario, faixas, top,
    pico: maior ? { rotulo: maior.rotulo, qtd: maior.qtd } : null,
    primeira: comHora[0], ultima: comHora[comHora.length - 1],
  }
}

// Chave para juntar a mesma pessoa em cadastros diferentes (CPF ou nome)
export const chavePessoa = (p) => soDigitos(p.cpf) || 'nome:' + normalizar(p.nome)

// Comparativo entre dias/eventos: uma linha por pessoa (sem duplicidade)
export function calcularComparativo(eventoIds, inscPorEvento, pessoaPorId) {
  const linhas = new Map()
  for (const evId of eventoIds) {
    for (const i of inscPorEvento[evId] || []) {
      if (!contaNoEvento(i) && !i.conferido) continue
      const p = pessoaPorId[i.pessoa_id]
      if (!p) continue
      const k = chavePessoa(p)
      if (!linhas.has(k)) linhas.set(k, { chave: k, nome: p.nome.trim(), cpf: p.cpf, foto_path: p.foto_path, dias: {} })
      const l = linhas.get(k)
      if (!l.foto_path && p.foto_path) l.foto_path = p.foto_path
      const atual = l.dias[evId]
      const novo = i.conferido ? { presente: true, em: i.conferido_em } : { presente: false }
      if (!atual || (!atual.presente && novo.presente)) l.dias[evId] = novo
    }
  }
  const resultado = [...linhas.values()].map((l) => ({
    ...l,
    total: eventoIds.filter((id) => l.dias[id]?.presente).length,
  }))
  resultado.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))

  const resumo = eventoIds.map((id) => {
    const cad = resultado.filter((l) => l.dias[id]).length
    const conf = resultado.filter((l) => l.dias[id]?.presente).length
    return { eventoId: id, cadastrados: cad, confirmados: conf, taxa: cad ? (conf / cad) * 100 : 0 }
  })
  return { linhas: resultado, resumo }
}
