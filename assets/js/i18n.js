// Interface text in Portuguese and English, and the current language (zorzo-api LLD "Front against the API",
// "Interface language"): set in <head> before the first paint, saved when the visitor switches.

const T = {
  pt: {
    typed: "construindo sistemas inteligentes", role: "Senior backend engineer · IA aplicada",
    send: "Perguntar", close: "Fechar", tele: "telemetria", askLabel: "Pergunte sobre o trabalho do André",
    hubs: {
      resume:   { title: "Currículo", body: "20+ anos de backend, remoto para os EUA desde 2006. Python, AWS, IA aplicada.", link: ["Baixar PDF", "andre-zorzo-resume.pdf"] },
      projects: { title: "Projetos", body: "Prosa (busca semântica em PDFs técnicos) · Battle of the Bits (jogo de robôs no navegador).", link: ["Ver projetos", "#projects"] },
      how:      { title: "Como este site funciona", body: "RAG + agente com limites de passo e custo. Spec e traces públicos quando o backend entrar no ar.", soon: "em breve" },
      blog:     { title: "Blog", body: "Notas de construção: o que eu medi, o que errei, o que mudou.", soon: "em breve" },
      contact:  { title: "Contato", body: "Vagas remotas e contratos.", link: ["Falar comigo", "#contact"] },
    },
    query: (n, c) => `query · ${n} termos · ${c} chars`, guardOk: "guard · ok", guardBlocked: (layer) => `guard · bloqueado (${layer})`,
    stage: (name, ms) => `${name} · ${ms} ms`,
    retrieve: (h, c, ms) => `retrieve · ${h} de ${c} trechos${ms === null ? "" : ` · ${ms} ms`}`,
    relevance: (top, cut) => `relevância · ${top} no topo · corte em ${cut}`,
    noHits: "nenhum trecho", searchOnly: "modo · só busca, sem modelo",
    latency: (ms) => `latência · ${ms} ms`, cost: "custo · US$0",
    blocked: "Bloqueado: parece uma tentativa de mudar as regras do agente. Essa camada existe de propósito, e o painel de defesas mostra quantas tentativas foram barradas.",
    searchOnlyNotice: "Modo só busca: estes são os trechos das fontes que mais combinam com a pergunta.",
    noSources: "Nenhuma fonte combina com esta pergunta.", tryExamples: "Tente uma destas:",
    sources: (n) => `Fontes · ${n}`, error: "Algo deu errado. Pergunte de novo.",
  },
  en: {
    typed: "building intelligent systems", role: "Senior backend engineer · Applied AI",
    send: "Ask", close: "Close", tele: "telemetry", askLabel: "Ask about André's work",
    hubs: {
      resume:   { title: "Résumé", body: "20+ years of backend, remote for US companies since 2006. Python, AWS, applied AI.", link: ["Download PDF", "andre-zorzo-resume.pdf"] },
      projects: { title: "Projects", body: "Prosa (semantic search over technical PDFs) · Battle of the Bits (robot combat in the browser).", link: ["See projects", "#projects"] },
      how:      { title: "How this site works", body: "RAG + an agent with step and cost limits. Spec and traces go public with the backend.", soon: "coming soon" },
      blog:     { title: "Blog", body: "Build notes: what I measured, what I got wrong, what changed.", soon: "coming soon" },
      contact:  { title: "Contact", body: "Remote roles and contracts.", link: ["Get in touch", "#contact"] },
    },
    query: (n, c) => `query · ${n} terms · ${c} chars`, guardOk: "guard · ok", guardBlocked: (layer) => `guard · blocked (${layer})`,
    stage: (name, ms) => `${name} · ${ms} ms`,
    retrieve: (h, c, ms) => `retrieve · ${h} of ${c} chunks${ms === null ? "" : ` · ${ms} ms`}`,
    relevance: (top, cut) => `relevance · ${top} at top · cut at ${cut}`,
    noHits: "no chunks", searchOnly: "mode · search only, no model",
    latency: (ms) => `latency · ${ms} ms`, cost: "cost · US$0",
    blocked: "Blocked: this looks like an attempt to change the agent's rules. That layer is there on purpose, and the defenses page shows how many attempts were stopped.",
    searchOnlyNotice: "Search-only mode: these are the source passages that best match the question.",
    noSources: "No matching sources for this question.", tryExamples: "Try one of these:",
    sources: (n) => `Sources · ${n}`, error: "Something went wrong. Ask again.",
  },
};

let lang = document.documentElement.dataset.lang === "en" ? "en" : "pt";
const listeners = [];

export const t = () => T[lang];
export const currentLang = () => lang;

/** Calls fn now and on every language change. */
export function onLang(fn) { listeners.push(fn); fn(lang); }

export function setLang(next) {
  lang = next === "en" ? "en" : "pt";
  try { localStorage.setItem("lang", lang); } catch { /* storage blocked */ }
  document.documentElement.lang = lang === "pt" ? "pt-BR" : "en";
  document.documentElement.dataset.lang = lang;   // the content below the hero shows .pt or .en from this
  listeners.forEach((fn) => fn(lang));
}
