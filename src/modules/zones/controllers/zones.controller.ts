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
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { AppRole } from '../../auth/roles.enum';
import { CreateZoneDto } from '../dto/create-zone.dto';
import { UpdateZoneDto } from '../dto/update-zone.dto';
import { ZonesService } from '../zones.service';

@Controller('zones')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class ZonesController {
  constructor(private readonly zonesService: ZonesService) {}

  @Get('predefined')
  @Roles(AppRole.ADMIN)
  getPredefinedRegions() {
    return this.zonesService.getPredefinedRegions();
  }

  @Get()
  @Roles(AppRole.ADMIN)
  findAll() {
    return this.zonesService.findAll();
  }

  @Get('my-zone/map')
  @Roles(AppRole.RESPONSABLE_ZONE)
  getMyZoneMap(@Req() req: any) {
    return this.zonesService.findById(req.user.zoneId);
  }

  @Patch('my-zone/map')
  @Roles(AppRole.RESPONSABLE_ZONE)
  updateMyZoneMap(@Req() req: any, @Body() dto: UpdateZoneDto) {
    return this.zonesService.update(req.user.zoneId, dto);
  }

  @Get(':id')
  @Roles(AppRole.ADMIN)
  findById(@Param('id') id: string) {
    return this.zonesService.findById(id);
  }

  @Post()
  @Roles(AppRole.ADMIN)
  @HttpCode(201)
  create(@Body() dto: CreateZoneDto) {
    return this.zonesService.create(dto);
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
