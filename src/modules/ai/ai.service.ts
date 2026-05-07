import { Injectable } from '@nestjs/common';

export type AiAnalysis = {
  category: 'panne' | 'coupure' | 'installation';
  priority: 'low' | 'medium' | 'high';
  recommendation: string;
};

@Injectable()
export class AiService {
  analyze(description: string): AiAnalysis {
    const text = description.toLowerCase();

    if (text.includes('coupure') || text.includes('pas de signal')) {
      return {
        category: 'coupure',
        priority: 'high',
        recommendation: 'Envoyer une equipe terrain immediatement et verifier le backbone local.',
      };
    }

    if (text.includes('installation') || text.includes('nouveau')) {
      return {
        category: 'installation',
        priority: 'low',
        recommendation: 'Planifier un rendez-vous installation avec verification de faisabilite.',
      };
    }

    return {
      category: 'panne',
      priority: 'medium',
      recommendation: 'Diagnostiquer le point de terminaison puis escalader si recurrent.',
    };
  }
}
