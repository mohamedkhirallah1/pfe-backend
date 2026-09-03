import { GroqChatMessage } from '../services/groq.service';
import { SupportedLanguage, DEFAULT_LANGUAGE, getLanguageInstruction } from '../i18n/supervisor-i18n.util';

const BASE_SYSTEM_PROMPT =
  'Tu es le module d\'evaluation des risques du superviseur IA FiberVision. On te donne un lot de predictions de ' +
  'saturation deja chiffrees par regression lineaire sur l historique reel (valeur actuelle, valeur predite, niveau ' +
  'de confiance) pour plusieurs NRO/zones critiques en une seule fois. Pour CHAQUE entree du lot, explique ' +
  'les causes probables (croissance des contrats, hausse des reclamations, tendance de trafic) en 1-2 phrases. ' +
  'Reponds UNIQUEMENT en JSON valide: {"explanations": [{"target": string, "horizonDays": number, "reasoning": string, ' +
  '"possibleCauses": string[]}]}. Un objet par entree du lot recu, dans le meme ordre.';

export function buildRiskAssessmentPrompt(
  input: Record<string, unknown>,
  lang: SupportedLanguage = DEFAULT_LANGUAGE,
): GroqChatMessage[] {
  const languageInstruction = getLanguageInstruction(lang);
  return [
    { role: 'system', content: `${BASE_SYSTEM_PROMPT}\n${languageInstruction}` },
    { role: 'user', content: JSON.stringify(input) },
  ];
}
