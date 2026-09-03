import {
  normalizeLanguage,
  getLanguageInstruction,
  formatNroSaturationAlert,
  formatFdtOccupationAlert,
  formatAppHealthAlert,
  formatPredictionAlert,
  formatComplaintSpikeAlert,
  formatExecutiveReportFallback,
  formatFdtRecommendationFallback,
  formatAnomalyExplanationFallback,
} from './supervisor-i18n.util';

describe('supervisor-i18n.util', () => {
  describe('normalizeLanguage', () => {
    it('should normalize valid languages', () => {
      expect(normalizeLanguage('fr')).toBe('fr');
      expect(normalizeLanguage('en')).toBe('en');
      expect(normalizeLanguage('ar')).toBe('ar');
      expect(normalizeLanguage('EN')).toBe('en');
      expect(normalizeLanguage('ar-TN')).toBe('ar');
    });

    it('should fallback to fr on unknown or empty languages', () => {
      expect(normalizeLanguage(null)).toBe('fr');
      expect(normalizeLanguage(undefined)).toBe('fr');
      expect(normalizeLanguage('de')).toBe('fr');
      expect(normalizeLanguage('')).toBe('fr');
    });
  });

  describe('getLanguageInstruction', () => {
    it('should return appropriate prompt instruction per language', () => {
      expect(getLanguageInstruction('fr')).toContain('UNIQUEMENT en francais');
      expect(getLanguageInstruction('en')).toContain('ONLY in English');
      expect(getLanguageInstruction('ar')).toContain('باللغة العربية الفصحى');
    });
  });

  describe('formatNroSaturationAlert', () => {
    it('should format NRO saturation alert in fr, en, ar', () => {
      expect(formatNroSaturationAlert('NRO-TUNIS-01', 92, 'fr')).toBe('NRO NRO-TUNIS-01 a 92% de saturation.');
      expect(formatNroSaturationAlert('NRO-TUNIS-01', 92, 'en')).toBe('NRO NRO-TUNIS-01 is at 92% saturation.');
      expect(formatNroSaturationAlert('NRO-TUNIS-01', 92, 'ar')).toBe('NRO NRO-TUNIS-01 لديه نسبة تشبع تبلغ 92%.');
    });
  });

  describe('formatFdtOccupationAlert', () => {
    it('should format FDT occupation alert in fr, en, ar', () => {
      expect(formatFdtOccupationAlert('FDT-01', 85, 'fr')).toBe('FDT FDT-01 a 85% d occupation.');
      expect(formatFdtOccupationAlert('FDT-01', 85, 'en')).toBe('FDT FDT-01 is at 85% occupation.');
      expect(formatFdtOccupationAlert('FDT-01', 85, 'ar')).toBe('FDT FDT-01 لديه نسبة إشغال تبلغ 85%.');
    });
  });

  describe('formatAppHealthAlert', () => {
    it('should format app health alert in fr, en, ar', () => {
      expect(formatAppHealthAlert('MongoDB', 'down', 'fr')).toBe('Service MongoDB indisponible ou degrade: down');
      expect(formatAppHealthAlert('MongoDB', 'down', 'en')).toBe('Service MongoDB unavailable or degraded: down');
      expect(formatAppHealthAlert('MongoDB', 'down', 'ar')).toBe('الخدمة MongoDB غير متاحة أو متدهورة: down');
    });
  });

  describe('formatPredictionAlert', () => {
    it('should format prediction alert in fr, en, ar', () => {
      expect(formatPredictionAlert('NRO-01', 14, 95, 'fr')).toBe('Risque de saturation sur NRO-01 sous 14 jours (95% prevu).');
      expect(formatPredictionAlert('NRO-01', 14, 95, 'en')).toBe('Saturation risk on NRO-01 within 14 days (95% predicted).');
      expect(formatPredictionAlert('NRO-01', 14, 95, 'ar')).toBe('خطر تشبع في NRO-01 خلال 14 يوماً (المتوقع 95%).');
    });
  });

  describe('formatComplaintSpikeAlert', () => {
    it('should format complaint spike alert in fr, en, ar', () => {
      expect(formatComplaintSpikeAlert('Tunis', 25, 'fr')).toBe('Hausse critique des reclamations (25 en 24h) sur la zone Tunis.');
      expect(formatComplaintSpikeAlert('Tunis', 25, 'en')).toBe('Critical complaint spike (25 in 24h) in zone Tunis.');
      expect(formatComplaintSpikeAlert('Tunis', 25, 'ar')).toBe('ارتفاع حرج في الشكاوى (25 خلال 24 ساعة) في منطقة Tunis.');
    });
  });

  describe('formatExecutiveReportFallback', () => {
    it('should format report fallback in fr, en, ar', () => {
      expect(formatExecutiveReportFallback(80, 'MODERATE', undefined, 'fr')).toContain('Rapport genere sans LLM');
      expect(formatExecutiveReportFallback(80, 'MODERATE', undefined, 'en')).toContain('Report generated without LLM');
      expect(formatExecutiveReportFallback(80, 'MODERATE', undefined, 'ar')).toContain('تقرير تم إنشاؤه بدون الذكاء الاصطناعي');
    });
  });

  describe('formatFdtRecommendationFallback', () => {
    it('should format FDT recommendation in fr, en, ar', () => {
      const fr = formatFdtRecommendationFallback('FDT-10', 'Ariana', 95, true, 'fr');
      expect(fr.title).toContain('Extension urgente');

      const en = formatFdtRecommendationFallback('FDT-10', 'Ariana', 95, true, 'en');
      expect(en.title).toContain('Urgent capacity extension');

      const ar = formatFdtRecommendationFallback('FDT-10', 'Ariana', 95, true, 'ar');
      expect(ar.title).toContain('توسيع عاجل للسعة');
    });
  });

  describe('formatAnomalyExplanationFallback', () => {
    it('should format anomaly explanation in fr, en, ar', () => {
      const fr = formatAnomalyExplanationFallback('NRO-01', 'SATURATION_SPIKE', 92, 60, 'CRITICAL', 'fr');
      expect(fr.explanation).toContain('Pic de saturation anormal');

      const en = formatAnomalyExplanationFallback('NRO-01', 'SATURATION_SPIKE', 92, 60, 'CRITICAL', 'en');
      expect(en.explanation).toContain('Abnormal saturation spike');

      const ar = formatAnomalyExplanationFallback('NRO-01', 'SATURATION_SPIKE', 92, 60, 'CRITICAL', 'ar');
      expect(ar.explanation).toContain('ذروة تشبع غير طبيعية');
    });
  });
});
