import { Injectable } from '@nestjs/common';
import { AutoCorrectionReport, AutoCorrectionService } from '../services/auto-correction.service';

/**
 * Thin agent facade over AutoCorrectionService: keeps the "Auto Repair Agent" name from the
 * agent roster without re-implementing the audit/repair logic, which stays a single
 * source of truth in AutoCorrectionService (reused as-is, per the "don't duplicate" mandate).
 */
@Injectable()
export class AutoRepairAgent {
  constructor(private readonly autoCorrectionService: AutoCorrectionService) {}

  runAudit(): Promise<AutoCorrectionReport> {
    return this.autoCorrectionService.runAudit();
  }
}
