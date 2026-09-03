export type SupportedLanguage = 'fr' | 'en' | 'ar';

export const DEFAULT_LANGUAGE: SupportedLanguage = 'fr';

export function normalizeLanguage(lang?: string | null): SupportedLanguage {
  if (!lang) return DEFAULT_LANGUAGE;
  const lower = lang.toLowerCase().trim();
  if (lower === 'en' || lower.startsWith('en-')) return 'en';
  if (lower === 'ar' || lower.startsWith('ar-')) return 'ar';
  return 'fr';
}

/**
 * Prompt instruction enforcing response language while strictly preserving JSON schema and technical identifiers.
 */
export function getLanguageInstruction(lang: SupportedLanguage = DEFAULT_LANGUAGE): string {
  switch (lang) {
    case 'en':
      return (
        'IMPORTANT LANGUAGE RULE: You MUST produce all user-facing narrative and textual explanations ' +
        '(such as "narrative", "explanation", "reason", "title", "summary", "expectedImpact", "riskPotential", "likelyCause", "recommendation") ' +
        'ONLY in English. ' +
        'DO NOT translate technical identifiers, equipment names (e.g. NRO, FDT, Centrale IDs), ISO codes, GPS coordinates, numbers, scores, or JSON enum/status keys. ' +
        'Respond ONLY with valid JSON.'
      );
    case 'ar':
      return (
        'قاعدة لغوية إلزامية: يجب كتابة جميع النصوص التفسيرية والسردية الموجهة للمستخدم ' +
        '(مثل "narrative", "explanation", "reason", "title", "summary", "expectedImpact", "riskPotential", "likelyCause", "recommendation") ' +
        'حصراً باللغة العربية الفصحى. ' +
        'ممنوع ترجمة المعرفات التقنية وأسماء المعدات (مثل NRO، FDT، Centrale)، الأكواد، الإحداثيات الجغرافية، الأرقام، النسب المئوية، أو مفاتيح JSON والحالات الثابتة. ' +
        'يجب أن يكون الرد بصيغة JSON صالحة فقط.'
      );
    case 'fr':
    default:
      return (
        'REGLE LINGUISTIQUE: Tu dois rediger tous les textes explicatifs et narratifs destines a l utilisateur ' +
        '(tels que "narrative", "explanation", "reason", "title", "summary", "expectedImpact", "riskPotential", "likelyCause", "recommendation") ' +
        'UNIQUEMENT en francais. ' +
        'NE TRADUIS JAMAIS les identifiants techniques, noms d equipements (ex: NRO, FDT, Centrale), codes ISO, coordonnees GPS, chiffres, scores ou enums/statuts JSON. ' +
        'Reponds UNIQUEMENT en JSON valide.'
      );
  }
}

// -----------------------------------------------------------------------------
// Localized Alert Messages
// -----------------------------------------------------------------------------

export function formatNroSaturationAlert(
  nroExternalId: string,
  saturationPct: number,
  lang: SupportedLanguage = DEFAULT_LANGUAGE,
): string {
  const rounded = Math.round(saturationPct);
  switch (lang) {
    case 'en':
      return `NRO ${nroExternalId} is at ${rounded}% saturation.`;
    case 'ar':
      return `NRO ${nroExternalId} لديه نسبة تشبع تبلغ ${rounded}%.`;
    case 'fr':
    default:
      return `NRO ${nroExternalId} a ${rounded}% de saturation.`;
  }
}

export function formatFdtOccupationAlert(
  fdtExternalId: string,
  occupationPct: number,
  lang: SupportedLanguage = DEFAULT_LANGUAGE,
): string {
  const rounded = Math.round(occupationPct);
  switch (lang) {
    case 'en':
      return `FDT ${fdtExternalId} is at ${rounded}% occupation.`;
    case 'ar':
      return `FDT ${fdtExternalId} لديه نسبة إشغال تبلغ ${rounded}%.`;
    case 'fr':
    default:
      return `FDT ${fdtExternalId} a ${rounded}% d occupation.`;
  }
}

export function formatAppHealthAlert(
  serviceName: string,
  detail: string | undefined,
  lang: SupportedLanguage = DEFAULT_LANGUAGE,
): string {
  switch (lang) {
    case 'en':
      return `Service ${serviceName} unavailable or degraded: ${detail ?? 'no details'}`;
    case 'ar':
      return `الخدمة ${serviceName} غير متاحة أو متدهورة: ${detail ?? 'لا توجد تفاصيل'}`;
    case 'fr':
    default:
      return `Service ${serviceName} indisponible ou degrade: ${detail ?? 'aucun detail'}`;
  }
}

export function formatPredictionAlert(
  entityId: string,
  horizonDays: number,
  predictedPct: number,
  lang: SupportedLanguage = DEFAULT_LANGUAGE,
): string {
  const rounded = Math.round(predictedPct);
  switch (lang) {
    case 'en':
      return `Saturation risk on ${entityId} within ${horizonDays} days (${rounded}% predicted).`;
    case 'ar':
      return `خطر تشبع في ${entityId} خلال ${horizonDays} يوماً (المتوقع ${rounded}%).`;
    case 'fr':
    default:
      return `Risque de saturation sur ${entityId} sous ${horizonDays} jours (${rounded}% prevu).`;
  }
}

export function formatComplaintSpikeAlert(
  zoneName: string,
  count: number,
  lang: SupportedLanguage = DEFAULT_LANGUAGE,
): string {
  switch (lang) {
    case 'en':
      return `Critical complaint spike (${count} in 24h) in zone ${zoneName}.`;
    case 'ar':
      return `ارتفاع حرج في الشكاوى (${count} خلال 24 ساعة) في منطقة ${zoneName}.`;
    case 'fr':
    default:
      return `Hausse critique des reclamations (${count} en 24h) sur la zone ${zoneName}.`;
  }
}

// -----------------------------------------------------------------------------
// Localized Deterministic Fallbacks
// -----------------------------------------------------------------------------

export function formatExecutiveReportFallback(
  networkScore: number,
  risk: string,
  globalCounts: Record<string, unknown> | undefined,
  lang: SupportedLanguage = DEFAULT_LANGUAGE,
): string {
  const extra = globalCounts ? ` ${JSON.stringify(globalCounts)}` : '';
  switch (lang) {
    case 'en':
      return `Report generated without LLM (Groq unavailable or not configured). Network score: ${networkScore}/100, global risk: ${risk}.${extra}`;
    case 'ar':
      return `تقرير تم إنشاؤه بدون الذكاء الاصطناعي (Groq غير متاح أو غير مهيأ). تقييم الشبكة: ${networkScore}/100، المخاطر العامة: ${risk}.${extra}`;
    case 'fr':
    default:
      return `Rapport genere sans LLM (Groq indisponible ou non configure). Score reseau: ${networkScore}/100, risque global: ${risk}.${extra}`;
  }
}

export function formatFdtRecommendationFallback(
  fdtExternalId: string,
  zoneName: string,
  occupationPct: number,
  critical: boolean,
  lang: SupportedLanguage = DEFAULT_LANGUAGE,
): { title: string; reason: string; expectedImpact: string } {
  const rounded = Math.round(occupationPct);
  switch (lang) {
    case 'en':
      return {
        title: `${critical ? 'Urgent capacity extension' : 'Capacity monitoring'} for FDT ${fdtExternalId}`,
        reason: `FDT ${fdtExternalId} (${zoneName}) is at ${rounded}% occupation.`,
        expectedImpact: critical
          ? 'Prevents full saturation and rejection of new customer contracts.'
          : 'Anticipates saturation before it affects service quality.',
      };
    case 'ar':
      return {
        title: `${critical ? 'توسيع عاجل للسعة' : 'مراقبة السعة'} لـ FDT ${fdtExternalId}`,
        reason: `FDT ${fdtExternalId} (${zoneName}) لديه نسبة إشغال تبلغ ${rounded}%.`,
        expectedImpact: critical
          ? 'يمنع التشبع الكامل ورفض عقود المشتركين الجدد.'
          : 'يستبق التشبع قبل أن يؤثر على جودة الخدمة.',
      };
    case 'fr':
    default:
      return {
        title: `${critical ? 'Extension urgente' : 'Surveillance'} de capacite pour FDT ${fdtExternalId}`,
        reason: `FDT ${fdtExternalId} (${zoneName}) est occupe a ${rounded}%.`,
        expectedImpact: critical
          ? 'Evite la saturation complete et le rejet de nouveaux contrats.'
          : 'Anticipates la saturation avant qu elle n impacte le service.',
      };
  }
}

export function formatAnomalyExplanationFallback(
  entityNameOrId: string,
  anomalyType: string,
  currentValue: number,
  historicalMean: number,
  severity: string,
  lang: SupportedLanguage = DEFAULT_LANGUAGE,
): { explanation: string; recommendation: string; riskPotential: string } {
  switch (lang) {
    case 'en': {
      let explanation = `Anomaly detected on ${entityNameOrId}: behavior deviates from historical mean.`;
      if (anomalyType === 'MULTI_SIGNAL_ANOMALY') {
        explanation = `Critical multi-signal anomaly on ${entityNameOrId}: strong divergence from history and high load correlation.`;
      } else if (anomalyType === 'SATURATION_SPIKE') {
        explanation = `Abnormal saturation spike detected on ${entityNameOrId} (current: ${currentValue}% vs historical mean: ${historicalMean}%).`;
      } else if (anomalyType === 'COMPLAINT_SPIKE') {
        explanation = `Abnormal spike in complaint volume on ${entityNameOrId}.`;
      }
      const recommendation =
        severity === 'CRITICAL'
          ? 'Priority intervention recommended: rebalance load and check optical connections.'
          : 'Strengthen preventive monitoring and verify growth trajectory.';
      const riskPotential =
        severity === 'CRITICAL' ? 'High service degradation risk' : 'Monitoring recommended';
      return { explanation, recommendation, riskPotential };
    }
    case 'ar': {
      let explanation = `تم اكتشاف خلل في ${entityNameOrId}: السلوك ينحرف عن المتوسط التاريخي.`;
      if (anomalyType === 'MULTI_SIGNAL_ANOMALY') {
        explanation = `خلل حرج متعدد الإشارات في ${entityNameOrId}: تباين قوي عن السجل التاريخي وترابط حمولة مرتفع.`;
      } else if (anomalyType === 'SATURATION_SPIKE') {
        explanation = `تم اكتشاف ذروة تشبع غير طبيعية في ${entityNameOrId} (الحالي: ${currentValue}% مقابل المتوسط التاريخي: ${historicalMean}%).`;
      } else if (anomalyType === 'COMPLAINT_SPIKE') {
        explanation = `ارتفاع غير طبيعي في حجم الشكاوى في ${entityNameOrId}.`;
      }
      const recommendation =
        severity === 'CRITICAL'
          ? 'يوصى بتدخل ذي أولوية: إعادة توازن الحمولة وفحص التوصيلات الضوئية.'
          : 'تعزيز المراقبة الوقائية والتحقق من مسار النمو.';
      const riskPotential =
        severity === 'CRITICAL' ? 'خطر مرتفع لتدهور الخدمة' : 'يوصى بالمراقبة';
      return { explanation, recommendation, riskPotential };
    }
    case 'fr':
    default: {
      let explanation = `Anomalie détectée sur ${entityNameOrId} : le comportement s'écarte de la moyenne historique.`;
      if (anomalyType === 'MULTI_SIGNAL_ANOMALY') {
        explanation = `Anomalie multi-signaux critique sur ${entityNameOrId} : forte divergence par rapport à l'historique et corrélation de charge élevée.`;
      } else if (anomalyType === 'SATURATION_SPIKE') {
        explanation = `Pic de saturation anormal détecté sur ${entityNameOrId} (valeur actuelle : ${currentValue}% vs moyenne historique : ${historicalMean}%).`;
      } else if (anomalyType === 'COMPLAINT_SPIKE') {
        explanation = `Hausse anormale du volume de réclamations sur ${entityNameOrId}.`;
      }
      const recommendation =
        severity === 'CRITICAL'
          ? 'Intervention prioritaire recommandée : rééquilibrer la charge et contrôler les raccordements optiques.'
          : 'Renforcer la surveillance préventive et vérifier la trajectoire de croissance.';
      const riskPotential =
        severity === 'CRITICAL' ? 'Risque de dégradation de service élevé' : 'Surveillance recommandée';
      return { explanation, recommendation, riskPotential };
    }
  }
}
