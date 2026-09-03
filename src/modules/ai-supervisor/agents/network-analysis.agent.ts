import { Injectable } from '@nestjs/common';
import { buildExecutiveReportPrompt } from '../prompts/executive-report.prompt';
import { ExplanationCacheService } from '../services/explanation-cache.service';
import { GroqService, GroqPriority } from '../services/groq.service';
import { SupportedLanguage, DEFAULT_LANGUAGE, formatExecutiveReportFallback } from '../i18n/supervisor-i18n.util';

/** Produces the executive narrative summary from already-computed structured metrics. */
@Injectable()
export class NetworkAnalysisAgent {
  constructor(
    private readonly groqService: GroqService,
    private readonly explanationCache: ExplanationCacheService,
  ) {}

  async buildNarrative(
    reportInput: Record<string, unknown>,
    options: { scope?: string; priority?: GroqPriority; lang?: SupportedLanguage } = {},
  ): Promise<{ narrative: string; generatedByLlm: boolean }> {
    const scope = options.scope ?? 'global';
    const lang = options.lang ?? DEFAULT_LANGUAGE;
    const cacheType = 'executiveReportNarrative';
    const cacheKeyInput = { ...reportInput, lang };

    let result = await this.explanationCache.get<{ narrative: string }>(scope, cacheType, cacheKeyInput);
    if (!result) {
      result = await this.groqService.chatJSON<{ narrative: string }>(
        buildExecutiveReportPrompt(reportInput, lang),
        { priority: options.priority },
      );
      if (result) {
        await this.explanationCache.set(scope, cacheType, cacheKeyInput, result);
      }
    }

    if (result?.narrative) {
      return { narrative: result.narrative, generatedByLlm: true };
    }

    const globalCounts = reportInput.globalCounts as Record<string, unknown> | undefined;
    return {
      narrative: formatExecutiveReportFallback(
        Number(reportInput.networkScore ?? 0),
        String(reportInput.risk ?? 'UNKNOWN'),
        globalCounts,
        lang,
      ),
      generatedByLlm: false,
    };
  }
}
