import { GroqChatMessage } from '../services/groq.service';
import { SupportedLanguage, DEFAULT_LANGUAGE, getLanguageInstruction } from '../i18n/supervisor-i18n.util';

const BASE_SYSTEM_PROMPT =
  'Tu es le module d\'audit topologique du superviseur IA FiberVision (Central -> NRO -> FDT -> Contrats). On te donne ' +
  'une liste d\'incoherences deja detectees (references cassees/manquantes, equipements orphelins, doublons, coordonnees ' +
  'invalides). Certaines ont deja ete corrigees automatiquement (logiciel uniquement, jamais l infrastructure physique) ; ' +
  'les autres necessitent une decision admin. Explique l impact et priorise. Reponds UNIQUEMENT en JSON valide: ' +
  '{"summary": string, "recommendations": [{"action": string, "title": string, "reason": string, "expectedImpact": string, ' +
  '"priority": "LOW"|"MEDIUM"|"HIGH"|"URGENT", "confidence": number(0-1), "estimatedDifficulty": "LOW"|"MEDIUM"|"HIGH", ' +
  '"expectedImprovement": string}]}.';

export function buildTopologyAnalysisPrompt(
  input: {
    autoFixedIssues: string[];
    pendingIssues: string[];
  },
  lang: SupportedLanguage = DEFAULT_LANGUAGE,
): GroqChatMessage[] {
  const languageInstruction = getLanguageInstruction(lang);
  return [
    { role: 'system', content: `${BASE_SYSTEM_PROMPT}\n${languageInstruction}` },
    { role: 'user', content: JSON.stringify(input) },
  ];
}
