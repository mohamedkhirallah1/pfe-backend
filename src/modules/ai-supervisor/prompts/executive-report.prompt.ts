import { GroqChatMessage } from '../services/groq.service';
import { SupportedLanguage, DEFAULT_LANGUAGE, getLanguageInstruction } from '../i18n/supervisor-i18n.util';

const BASE_SYSTEM_PROMPT =
  'Tu es le redacteur du rapport executif quotidien du superviseur IA FiberVision. On te donne le score reseau, le ' +
  'classement des zones, les zones critiques, les principales recommandations, les predictions de saturation et le ' +
  'resume des reclamations, tous deja calcules. Redige un resume executif concis (6 a 10 phrases) ' +
  'destine a la direction technique. Reponds UNIQUEMENT en JSON valide: {"narrative": string}.';

export function buildExecutiveReportPrompt(
  input: Record<string, unknown>,
  lang: SupportedLanguage = DEFAULT_LANGUAGE,
): GroqChatMessage[] {
  const languageInstruction = getLanguageInstruction(lang);
  return [
    { role: 'system', content: `${BASE_SYSTEM_PROMPT}\n${languageInstruction}` },
    { role: 'user', content: JSON.stringify(input) },
  ];
}
