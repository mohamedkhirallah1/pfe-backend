import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { AppRole } from '../auth/roles.enum';
import { MapService } from './map.service';

type AuthenticatedRequest = {
  user: {
    sub: string;
    role: AppRole;
    zoneId?: string;
  };
};

@Controller('map')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(AppRole.ADMIN, AppRole.RESPONSABLE_ZONE)
export class MapController {
  constructor(private readonly mapService: MapService) {}

  @Get('contracts')
  getContracts(@Req() req: AuthenticatedRequest) {
    return this.mapService.getContracts(req.user);
  }

  @Get('reclamations')
  getReclamations(@Req() req: AuthenticatedRequest) {
    return this.mapService.getReclamations(req.user);
  }

  @Get('nros')
  getNros(@Req() req: AuthenticatedRequest) {
    return this.mapService.getNros(req.user);
  }

  @Get('fdts')
  getFdts(@Req() req: AuthenticatedRequest) {
    return this.mapService.getFdts(req.user);
  }

  @Get('zones')
  getZones(@Req() req: AuthenticatedRequest) {
    return this.mapService.getZones(req.user);
  }

  @Get('zone/:id')
  getZoneById(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.mapService.getZoneById(id, req.user);
  }

  @Get('dashboard')
  getDashboard(@Req() req: AuthenticatedRequest) {
    return this.mapService.getDashboard(req.user);
  }
}
