// Interface text in Portuguese and English, and the current language (zorzo-api LLD "Front against the API",
// "Interface language"): set in <head> before the first paint, saved when the visitor switches.

/** A wait in seconds, in words: seconds under a minute, then minutes, then hours (rounded up). */
function wait(s, lang) {
  const [n, unit] = s < 60 ? [Math.max(1, Math.ceil(s)), "s"] : s < 3600 ? [Math.ceil(s / 60), "m"] : [Math.ceil(s / 3600), "h"];
  const names = lang === "pt" ? { s: ["segundo", "segundos"], m: ["minuto", "minutos"], h: ["hora", "horas"] }
    : { s: ["second", "seconds"], m: ["minute", "minutes"], h: ["hour", "hours"] };
  return `${n} ${names[unit][n === 1 ? 0 : 1]}`;
}

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
    query: (n, c) => `query · ${n} termos · ${c} chars`, guardOk: "guard · ok", guardBlocked: (layer) => `guard · bloqueado (${layer})`, guardError: "guard · sem classificador, seguiu",
    stage: (name, ms) => `${name} · ${ms} ms`,
    retrieve: (h, c, ms) => `retrieve · ${h} de ${c} trechos${ms === null ? "" : ` · ${ms} ms`}`,
    relevance: (top, cut) => `relevância · ${top} no topo · corte em ${cut}`,
    noHits: "nenhum trecho", searchOnly: "modo · só busca, sem modelo",
    reused: "reaproveitou uma resposta verificada para a mesma pergunta", reusedLabel: "Resposta reaproveitada: já verificada nas fontes para a mesma pergunta.",
    latency: (ms) => `latência · ${ms} ms`, cost: "custo · US$0",
    blockedBy: (layer, category) => `Bloqueado na camada ${layer}: ${{
      injection: "a pergunta parece uma tentativa de mudar as regras do agente.",
      prompt_leak: "a resposta ia expor as instruções internas do agente.",
    }[category] ?? "a requisição foi barrada."} Essa camada existe de propósito.`,
    defensesLink: "Ver o painel de defesas", blockMistake: "Foi um engano? Fale comigo",
    contactReply: "Para falar com o André, use um destes contatos:",
    searchOnlyNotice: "Modo só busca: estes são os trechos das fontes que mais combinam com a pergunta.",
    noSources: "Nenhuma fonte combina com esta pergunta.", tryExamples: "Tente uma destas:",
    sources: (n) => `Fontes · ${n}`, error: "Algo deu errado. Pergunte de novo.", trace: "Ver o trace desta pergunta",
    connectionLost: "A conexão caiu antes do fim. Pergunte de novo.",
    invalidInput: "Não deu para enviar esta pergunta. Escreva em texto simples, dentro do limite de tamanho.",
    botCheck: "A verificação anti-robô falhou. Recarregue a página e tente de novo.",
    tryAgainIn: (s) => `Muitas perguntas seguidas. Você pode perguntar de novo ${s == null ? "daqui a pouco" : `em ${wait(s, "pt")}`}.`,
    offline: "O backend está fora do ar. A caixa volta sozinha quando ele voltar.",
    degradedNotice: "Modo só busca: as respostas mostram os trechos das fontes, sem texto escrito por IA.",
    checking: "conferindo nas fontes…", removed: "removido: as fontes não sustentam",
    notInSources: "Não está nas minhas fontes: o material revisado não cobre esta pergunta.",
    related: "Trechos mais próximos", contactLink: "Falar com o André",
    declined: "Isso fica fora do que este site responde. Pergunte sobre a carreira do André, os projetos dele ou como o site foi feito.",
    cite: (n) => `fonte ${n}`, costOf: (usd) => `custo · US$${usd.toFixed(4)}`,
    newConversation: "Nova conversa",
    newConversationNotice: "Nova conversa: a anterior ficou parada tempo demais, e as perguntas dela não contam mais.",
    noContext: "Não tenho contexto anterior nesta conversa — sobre o que você está perguntando?",
    otherLanguage: "Este site responde em português e inglês.",
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
    query: (n, c) => `query · ${n} terms · ${c} chars`, guardOk: "guard · ok", guardBlocked: (layer) => `guard · blocked (${layer})`, guardError: "guard · classifier failed, went on",
    stage: (name, ms) => `${name} · ${ms} ms`,
    retrieve: (h, c, ms) => `retrieve · ${h} of ${c} chunks${ms === null ? "" : ` · ${ms} ms`}`,
    relevance: (top, cut) => `relevance · ${top} at top · cut at ${cut}`,
    noHits: "no chunks", searchOnly: "mode · search only, no model",
    reused: "reused a verified answer to the same question", reusedLabel: "Reused answer: already checked against the sources for the same question.",
    latency: (ms) => `latency · ${ms} ms`, cost: "cost · US$0",
    blockedBy: (layer, category) => `Blocked at layer ${layer}: ${{
      injection: "the question looks like an attempt to change the agent's rules.",
      prompt_leak: "the answer was about to expose the agent's internal instructions.",
    }[category] ?? "the request was stopped."} That layer is there on purpose.`,
    defensesLink: "See the defenses page", blockMistake: "A mistake? Get in touch",
    contactReply: "To reach André, use one of these:",
    searchOnlyNotice: "Search-only mode: these are the source passages that best match the question.",
    noSources: "No matching sources for this question.", tryExamples: "Try one of these:",
    sources: (n) => `Sources · ${n}`, error: "Something went wrong. Ask again.", trace: "See the trace of this question",
    connectionLost: "The connection dropped before the end. Ask again.",
    invalidInput: "This question can't be sent. Write it as plain text, within the length limit.",
    botCheck: "The bot check failed. Reload the page and try again.",
    tryAgainIn: (s) => `Too many questions in a row. You can ask again ${s == null ? "shortly" : `in ${wait(s, "en")}`}.`,
    offline: "The backend is unreachable. The box comes back by itself when it returns.",
    degradedNotice: "Search-only mode: answers show the source passages, with no AI-written text.",
    checking: "checking against sources…", removed: "removed: not supported by the sources",
    notInSources: "Not in my sources: the reviewed material doesn't cover this question.",
    related: "Closest passages", contactLink: "Contact André",
    declined: "That's outside what this site answers. Ask about André's career, his projects or how the site was built.",
    cite: (n) => `source ${n}`, costOf: (usd) => `cost · US$${usd.toFixed(4)}`,
    newConversation: "New conversation",
    newConversationNotice: "New conversation: the last one was idle too long, so its questions no longer count.",
    noContext: "I don't have earlier context in this conversation — what are you asking about?",
    otherLanguage: "This site answers in English and Portuguese.",
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
