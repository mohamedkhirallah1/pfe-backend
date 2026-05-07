import {
  Controller,
  Get,
  UseGuards,
  Req,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { AppRole } from '../../auth/roles.enum';
import { ReclamationsService } from '../reclamations.service';

@Controller('reclamations')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class ReclamationsController {
  constructor(private readonly reclamationsService: ReclamationsService) {}

  @Get()
  @Roles(AppRole.ADMIN, AppRole.RESPONSABLE_ZONE)
  async findReclamations(@Req() req: any) {
    const user = req.user;

    if (user.role === AppRole.ADMIN) {
      return {
        message: 'All reclamations retrieved successfully',
        data: await this.reclamationsService.findAllReclamations(),
      };
    }

    if (user.role === AppRole.RESPONSABLE_ZONE && user.zoneId) {
      return {
        message: `Reclamations for zone ${user.zoneId} retrieved successfully`,
        data: await this.reclamationsService.findReclamationsByZone(user.zoneId),
      };
    }

    return {
      message: 'No reclamations available for this user',
      data: [],
    };
  }

  @Get('stats')
  @Roles(AppRole.ADMIN)
  async getStats() {
    const stats = await this.reclamationsService.getReclamationStats();
    return {
      message: 'Reclamation statistics retrieved successfully',
      data: stats,
    };
  }
}
