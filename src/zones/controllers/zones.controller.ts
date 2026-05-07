import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CreateZoneDto } from '../dto/create-zone.dto';
import { Zone } from '../entities/zone.entity';
import { ZonesService } from '../services/zones.service';

@Controller('zones')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class ZonesController {
  constructor(private readonly zonesService: ZonesService) {}

  @Roles(Role.ADMIN)
  @Post()
  create(@Body() createZoneDto: CreateZoneDto): Promise<Zone> {
    return this.zonesService.create(createZoneDto);
  }

  @Roles(Role.ADMIN, Role.TECHNICIAN)
  @Get()
  findAll(): Promise<Zone[]> {
    return this.zonesService.findAll();
  }
}