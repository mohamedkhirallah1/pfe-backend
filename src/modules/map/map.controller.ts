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
@Roles(AppRole.ADMIN, AppRole.RESPONSABLE_ZONE, AppRole.SERVICE_CLIENT)
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

  /** Alias of /reclamations under the "complaints" name used by other parts of the platform (AI Supervisor). */
  @Get('complaints')
  getComplaints(@Req() req: AuthenticatedRequest) {
    return this.mapService.getReclamations(req.user);
  }

  @Get('centrales')
  getCentrales(@Req() req: AuthenticatedRequest) {
    return this.mapService.getCentrales(req.user);
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

  /** Zone -> Centrales -> NROs -> FDTs -> Contracts, fully nested (Step 5: hierarchical map API). */
  @Get('hierarchy')
  getHierarchy(@Req() req: AuthenticatedRequest) {
    return this.mapService.getHierarchy(req.user);
  }

  /** Per-zone counts/capacity/health, computed through the real hierarchy (Step 4). */
  @Get('zones/statistics')
  getZoneStatistics(@Req() req: AuthenticatedRequest) {
    return this.mapService.getZoneStatistics(req.user);
  }

  @Get('dashboard')
  getDashboard(@Req() req: AuthenticatedRequest) {
    return this.mapService.getDashboard(req.user);
  }

  @Get('central-fibers')
  getCentralFibersMap(@Req() req: AuthenticatedRequest) {
    return this.mapService.getCentralFibersMap(req.user);
  }

  @Get('topology-graph')
  getTopologyGraph(@Req() req: AuthenticatedRequest) {
    return this.mapService.getTopologyGraph(req.user);
  }
}
