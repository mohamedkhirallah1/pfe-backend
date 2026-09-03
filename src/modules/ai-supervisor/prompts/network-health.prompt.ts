import { GroqChatMessage } from '../services/groq.service';
import { SupportedLanguage, DEFAULT_LANGUAGE, getLanguageInstruction } from '../i18n/supervisor-i18n.util';

const BASE_SYSTEM_PROMPT =
  'Tu es le module de sante applicative du superviseur IA FiberVision. On te donne l etat de MongoDB, Redis/BullMQ, et ' +
  'la gateway WebSocket, deja verifie techniquement. Explique l impact operationnel d un service degrade et ' +
  'la severite. Reponds UNIQUEMENT en JSON valide: {"summary": string, "alerts": [{"source": "APP_HEALTH", ' +
  '"severity": "LOW"|"MEDIUM"|"HIGH"|"CRITICAL", "message": string}]}.';

export function buildNetworkHealthPrompt(
  input: Record<string, unknown>,
  lang: SupportedLanguage = DEFAULT_LANGUAGE,
): GroqChatMessage[] {
  const languageInstruction = getLanguageInstruction(lang);
  return [
    { role: 'system', content: `${BASE_SYSTEM_PROMPT}\n${languageInstruction}` },
    { role: 'user', content: JSON.stringify(input) },
  ];
}
