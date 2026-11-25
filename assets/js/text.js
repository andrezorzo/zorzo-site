// Question and chunk words, without stop words: the mock search and the token flight use the same split.

import { norm } from "./util.js";

const STOP = new Set(("a an the of to in on for and or is are was were be been do does did he his him what which who how " +
  "this that with as at by from it its about me tell has have had o a os as um uma de do da dos das em no na nos nas " +
  "para por que qual quais quem como e é ele dele foi ser sobre me fale tem já ja").split(" "));
const SYN = { anos: "years", ano: "years", experiencia: "experience", projeto: "project", projetos: "project",
  banco: "database", vetorial: "vector", seguranca: "security", custo: "cost", custos: "cost", avaliacao: "evals",
  agente: "agent", agentes: "agents", busca: "search", pesquisa: "search", trabalhou: "worked", empresa: "company",
  nuvem: "cloud", fez: "built", funciona: "works", producao: "production", defesas: "defenses",
  grafo: "graph", carreira: "career", observabilidade: "observability", jogo: "game" };

/** The words of a question or chunk, without stop words. */
export const words = (x) => norm(x).split(/[^a-z0-9.+#]+/).map((w) => w.replace(/\.$/, "")).filter((w) => w.length > 1 && !STOP.has(w));
export const term = (w) => SYN[w] || w;
