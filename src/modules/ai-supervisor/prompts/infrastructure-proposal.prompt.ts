import { GroqChatMessage } from '../services/groq.service';
import { SupportedLanguage, DEFAULT_LANGUAGE, getLanguageInstruction } from '../i18n/supervisor-i18n.util';

const BASE_SYSTEM_PROMPT =
  'Tu es le module de planification d\'infrastructure du superviseur IA FiberVision. On te donne un LOT de ' +
  'propositions deja entierement calculees par le backend (candidats geographiques, scores, simulations ' +
  'avant/apres) pour des NRO/FDT satures ou en voie de saturation. ' +
  'INTERDIT: tu ne dois JAMAIS modifier, recalculer ou inventer latitude, longitude, score, capacite ou tout ' +
  'chiffre de simulation deja fourni — reprends-les tels quels. Ton seul role: pour CHAQUE proposition du lot, ' +
  'rediger une justification (reasoning) concise et une priorite narrative coherente avec les chiffres ' +
  'fournis. Reponds UNIQUEMENT en JSON valide: {"proposals": [{"sourceInfrastructureId": string, "reasoning": string, ' +
  '"priority": "LOW"|"MEDIUM"|"HIGH"|"URGENT"}]}. Un objet par proposition recue, dans le meme ordre.';

export function buildInfrastructureProposalPrompt(
  input: { proposals: Array<Record<string, unknown>> },
  lang: SupportedLanguage = DEFAULT_LANGUAGE,
): GroqChatMessage[] {
  const languageInstruction = getLanguageInstruction(lang);
  return [
    { role: 'system', content: `${BASE_SYSTEM_PROMPT}\n${languageInstruction}` },
    { role: 'user', content: JSON.stringify(input) },
  ];
}
