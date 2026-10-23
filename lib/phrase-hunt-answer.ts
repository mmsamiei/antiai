import { phraseHuntTargets } from "./data/phrase-hunt-targets";
import { normalizePersian } from "./normalize-persian";

const targetsById = new Map(phraseHuntTargets.map(target => [target.id, target]));
const answersById = new Map<string, Set<string>>();

export function phraseHuntTarget(id: string) { return targetsById.get(id); }

export function isPhraseHuntAnswer(target: (typeof phraseHuntTargets)[number], normalized: string) {
  let answers = answersById.get(target.id);
  if (!answers) {
    answers = new Set([target.phrase, ...target.aliases].map(normalizePersian));
    answersById.set(target.id, answers);
  }
  return answers.has(normalized);
}
