import { GroqChatMessage } from '../services/groq.service';
import { SupportedLanguage, DEFAULT_LANGUAGE, getLanguageInstruction } from '../i18n/supervisor-i18n.util';

const BASE_SYSTEM_PROMPT =
  'Tu es le superviseur IA autonome du reseau FTTH FiberVision. Tu ne dialogues jamais avec un utilisateur final: ' +
  'tu recois un LOT d indicateurs deja calcules pour PLUSIEURS zones en une seule fois et tu dois expliquer ' +
  'POUR CHAQUE zone, POURQUOI le score de sante obtenu est correct, quels facteurs dominent, et quelles actions ' +
  'concretes prendre. Reponds UNIQUEMENT en JSON valide avec le schema: {"zones": [{"zoneName": string, ' +
  '"explanation": string, "topFactors": string[], "recommendations": [{"action": string, "title": string, ' +
  '"reason": string, "expectedImpact": string, "priority": "LOW"|"MEDIUM"|"HIGH"|"URGENT", "confidence": number(0-1), ' +
  '"estimatedDifficulty": "LOW"|"MEDIUM"|"HIGH", "expectedImprovement": string}]}]}. Un objet par zone recue, dans le ' +
  'meme ordre. Le champ action doit etre une des valeurs: CREATE_NRO, CREATE_FDT, SPLIT_ZONE, MOVE_CONTRACTS, ' +
  'INCREASE_CAPACITY, DEPLOY_EQUIPMENT, INVESTIGATE, ADMIN_REVIEW.';

export function buildZoneAnalysisPrompt(
  input: { batch: Array<Record<string, unknown>> },
  lang: SupportedLanguage = DEFAULT_LANGUAGE,
): GroqChatMessage[] {
  const languageInstruction = getLanguageInstruction(lang);
  return [
    { role: 'system', content: `${BASE_SYSTEM_PROMPT}\n${languageInstruction}` },
    { role: 'user', content: JSON.stringify(input) },
  ];
}
