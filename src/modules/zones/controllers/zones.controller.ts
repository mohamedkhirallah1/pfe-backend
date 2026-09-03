import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  HttpCode,
  Req,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { AppRole } from '../../auth/roles.enum';
import { UpdateZoneDto } from '../dto/update-zone.dto';
import { ImportZoneGeojsonDto } from '../dto/import-zone-geojson.dto';
import { ZonesService } from '../zones.service';

@Controller('zones')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class ZonesController {
  constructor(private readonly zonesService: ZonesService) {}

  @Get('predefined')
  @Roles(AppRole.ADMIN, AppRole.SERVICE_CLIENT)
  getPredefinedRegions() {
    return this.zonesService.getPredefinedRegions();
  }

  @Get()
  @Roles(AppRole.ADMIN, AppRole.SERVICE_CLIENT)
  findAll() {
    return this.zonesService.findAll();
  }

  @Get('my-zone/map')
  @Roles(AppRole.RESPONSABLE_ZONE)
  getMyZoneMap(@Req() req: any) {
    if (!req.user?.zoneId) {
      throw new BadRequestException('No zone assigned to this account');
    }
    return this.zonesService.findById(req.user.zoneId);
  }

  @Patch('my-zone/map')
  @Roles(AppRole.RESPONSABLE_ZONE)
  updateMyZoneMap(@Req() req: any, @Body() dto: UpdateZoneDto) {
    if (!req.user?.zoneId) {
      throw new BadRequestException('No zone assigned to this account');
    }
    return this.zonesService.update(req.user.zoneId, dto);
  }

  @Post('my-zone/import-geojson')
  @Roles(AppRole.RESPONSABLE_ZONE)
  @HttpCode(200)
  importMyZoneGeoJson(@Req() req: any, @Body() dto: ImportZoneGeojsonDto) {
    if (!req.user?.zoneId) {
      throw new BadRequestException('No zone assigned to this account');
    }
    return this.zonesService.importZoneGeoJson(req.user.zoneId, dto, req.user);
  }

  @Get(':id')
  @Roles(AppRole.ADMIN, AppRole.SERVICE_CLIENT)
  findById(@Param('id') id: string) {
    return this.zonesService.findById(id);
  }

  @Post(':id/import-geojson')
  @Roles(AppRole.ADMIN, AppRole.RESPONSABLE_ZONE)
  @HttpCode(200)
  importZoneGeoJson(
    @Param('id') id: string,
    @Req() req: any,
    @Body() dto: ImportZoneGeojsonDto,
  ) {
    if (req.user?.role === AppRole.RESPONSABLE_ZONE) {
      if (!req.user.zoneId || req.user.zoneId !== id) {
        throw new ForbiddenException('You can only import data for your assigned zone');
      }
    }
    return this.zonesService.importZoneGeoJson(id, dto, req.user);
  }

  @Patch(':id')
  @Roles(AppRole.ADMIN)
  update(@Param('id') id: string, @Body() dto: UpdateZoneDto) {
    return this.zonesService.update(id, dto);
  }

  @Delete(':id')
  @Roles(AppRole.ADMIN)
  @HttpCode(200)
  remove(@Param('id') id: string) {
    return this.zonesService.remove(id);
  }
}
