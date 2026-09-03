import { GroqChatMessage } from '../services/groq.service';
import { SupportedLanguage, DEFAULT_LANGUAGE, getLanguageInstruction } from '../i18n/supervisor-i18n.util';

const BASE_SYSTEM_PROMPT =
  'Tu es le moteur de recommandation du superviseur IA FiberVision. On te donne des signaux bruts (saturation FDT/NRO, ' +
  'clusters geospatiaux non couverts, capacite) et, quand disponible, le resultat du moteur de simulation (avant/apres ' +
  'chiffre pour chaque scenario envisage). Genere des recommandations d\'infrastructure. L IA ne modifie JAMAIS ' +
  'l infrastructure physique elle-meme: elle ne fait que recommander (creation NRO/FDT, extension capacite, deploiement, ' +
  'scission de zone, deplacement de contrats) pour validation admin. Si un champ "simulation" est present dans les ' +
  'signaux, reprends ses chiffres tels quels dans expectedImprovement (ne les invente jamais). Reponds UNIQUEMENT en ' +
  'JSON valide: {"recommendations": [{"action": string, "title": string, "reason": string, "expectedImpact": string, ' +
  '"priority": "LOW"|"MEDIUM"|"HIGH"|"URGENT", "confidence": number(0-1), "affectedArea": string, ' +
  '"estimatedDifficulty": "LOW"|"MEDIUM"|"HIGH", "businessImpact": string, "technicalImpact": string, "risk": string, ' +
  '"estimatedCost": string, "estimatedEffort": string, "alternatives": string[], "expectedImprovement": string}]}.';

export function buildRecommendationPrompt(
  input: {
    context: string;
    signals: Record<string, unknown>;
  },
  lang: SupportedLanguage = DEFAULT_LANGUAGE,
): GroqChatMessage[] {
  const languageInstruction = getLanguageInstruction(lang);
  return [
    { role: 'system', content: `${BASE_SYSTEM_PROMPT}\n${languageInstruction}` },
    { role: 'user', content: JSON.stringify(input) },
  ];
}
