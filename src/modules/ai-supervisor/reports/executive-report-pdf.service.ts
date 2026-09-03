import { Injectable } from '@nestjs/common';
import * as PDFDocument from 'pdfkit';
import { ExecutiveReportDocument } from './schemas/executive-report.schema';

/**
 * Renders an already-built, already-scoped ExecutiveReportDocument to PDF bytes. Takes no
 * zoneId/role parameters and does no filtering itself — the report passed in IS the full,
 * final authorized content (GLOBAL or ZONE), so the PDF can never contain more than what the
 * caller already fetched and was authorized to see. Content sections vary only by `report.scope`.
 */
@Injectable()
export class ExecutiveReportPdfService {
  generate(report: ExecutiveReportDocument): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50 });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const isGlobal = report.scope !== 'ZONE';
      const createdAt = (report as any).createdAt instanceof Date ? (report as any).createdAt : new Date();

      // Cover
      doc.fontSize(22).text('Fiber_Vision — Rapport IA de supervision', { align: 'center' });
      doc.moveDown(0.5);
      doc.fontSize(14).fillColor('#555').text(isGlobal ? 'Rapport global (toutes zones)' : `Rapport de zone — ${report.zoneName ?? report.zoneId}`, { align: 'center' });
      doc.fillColor('black');
      doc.moveDown(0.3);
      doc.fontSize(10).fillColor('#888').text(`Genere le ${createdAt.toLocaleString('fr-FR')}`, { align: 'center' });
      doc.fillColor('black');
      doc.moveDown(1.5);

      // Summary
      doc.fontSize(16).text(isGlobal ? 'Resume global' : `Resume de la zone ${report.zoneName ?? ''}`);
      doc.moveDown(0.3);
      doc.fontSize(11);
      doc.text(`Score reseau: ${report.networkScore}/100`);
      doc.text(`Niveau de risque: ${report.risk}`);
      doc.text(`Confiance IA: ${Math.round((report.confidence ?? 0) * 100)}%`);
      doc.text(`Source: ${report.aiProvider === 'fallback' ? 'Generation deterministe (Groq indisponible)' : 'Groq (IA)'}`);
      doc.moveDown(1);

      if (isGlobal) {
        doc.fontSize(14).text('Zones');
        doc.moveDown(0.3);
        doc.fontSize(10);
        for (const z of report.zoneRanking ?? []) {
          doc.text(`${z.zoneName}: score ${z.healthScore}/100 — risque ${z.risk}`);
        }
        doc.moveDown(1);

        doc.fontSize(14).text('Zones critiques');
        doc.moveDown(0.3);
        doc.fontSize(10).text((report.criticalZones ?? []).join(', ') || 'Aucune');
        doc.moveDown(1);
      }

      doc.fontSize(14).text('Saturation predite');
      doc.moveDown(0.3);
      doc.fontSize(10);
      for (const p of (report.predictedSaturation ?? []) as any[]) {
        doc.text(`${p.target ?? ''} — ${p.horizonDays ?? ''}j: ${p.predictedValue ?? ''}% (confiance ${Math.round((p.confidence ?? 0) * 100)}%)`);
      }
      doc.moveDown(1);

      doc.fontSize(14).text(isGlobal ? 'Recommandations & propositions d\'infrastructure (top)' : 'Recommandations & propositions d\'infrastructure de la zone');
      doc.moveDown(0.3);
      doc.fontSize(10);
      for (const r of (report.topRecommendations ?? []) as any[]) {
        doc.text(`[${r.priority ?? ''}] ${r.title ?? ''} (${r.affectedArea ?? ''}) — confiance ${Math.round((r.confidence ?? 0) * 100)}%`);
      }
      doc.moveDown(1);

      doc.fontSize(14).text('Reclamations');
      doc.moveDown(0.3);
      doc.fontSize(10).text(String((report.complaintSummary as any)?.summary ?? 'N/A'));
      doc.moveDown(1);

      doc.fontSize(14).text(isGlobal ? 'Statistiques globales' : 'Statistiques de la zone');
      doc.moveDown(0.3);
      doc.fontSize(10);
      const counts = report.infrastructureEvolution as Record<string, unknown>;
      for (const [k, v] of Object.entries(counts ?? {})) {
        doc.text(`${k}: ${v}`);
      }
      doc.moveDown(1);

      doc.fontSize(14).text('Synthese IA');
      doc.moveDown(0.3);
      doc.fontSize(10).text(report.narrative ?? '');
      doc.moveDown(1);

      doc.fontSize(9).fillColor('#888').text(isGlobal ? 'Fin du rapport global.' : `Fin du rapport de la zone ${report.zoneName ?? report.zoneId}.`);

      doc.end();
    });
  }
}
