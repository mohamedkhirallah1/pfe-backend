import { GroqChatMessage } from '../services/groq.service';
import { SupportedLanguage, DEFAULT_LANGUAGE, getLanguageInstruction } from '../i18n/supervisor-i18n.util';

const BASE_SYSTEM_PROMPT =
  'Tu es le module d\'intelligence des reclamations du superviseur IA FiberVision (pas un chatbot, aucune interaction ' +
  'utilisateur). On te donne des reclamations deja groupees par type/zone/periode. Identifie les problemes recurrents, ' +
  'les degradations reseau probables, et predis l evolution. Reponds UNIQUEMENT en JSON valide avec le schema: ' +
  '{"summary": string, "recurringIssues": [{"pattern": string, "zoneName": string, "count": number, "likelyCause": string}], ' +
  '"prediction": {"trend": "INCREASING"|"STABLE"|"DECREASING", "reasoning": string, "confidence": number(0-1)}, ' +
  '"recommendations": [{"action": string, "title": string, "reason": string, "expectedImpact": string, ' +
  '"priority": "LOW"|"MEDIUM"|"HIGH"|"URGENT", "confidence": number(0-1), "estimatedDifficulty": "LOW"|"MEDIUM"|"HIGH", ' +
  '"expectedImprovement": string}]}.';

export function buildComplaintAnalysisPrompt(
  input: {
    totalLast30d: number;
    totalPrev30d: number;
    byTypeZone: Array<{ type: string; zoneName: string; count: number }>;
  },
  lang: SupportedLanguage = DEFAULT_LANGUAGE,
): GroqChatMessage[] {
  const languageInstruction = getLanguageInstruction(lang);
  return [
    { role: 'system', content: `${BASE_SYSTEM_PROMPT}\n${languageInstruction}` },
    { role: 'user', content: JSON.stringify(input) },
  ];
}
