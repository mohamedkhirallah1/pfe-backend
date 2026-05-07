import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CreatePolygonDto } from '../dto/create-polygon.dto';
import { PolygonEntity } from '../entities/polygon.entity';
import { PolygonsService } from '../services/polygons.service';

@Controller('polygons')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class PolygonsController {
  constructor(private readonly polygonsService: PolygonsService) {}

  @Roles(Role.ADMIN)
  @Post()
  create(@Body() createPolygonDto: CreatePolygonDto): Promise<PolygonEntity> {
    return this.polygonsService.create(createPolygonDto);
  }

  @Roles(Role.ADMIN, Role.TECHNICIAN)
  @Get()
  findAll(): Promise<PolygonEntity[]> {
    return this.polygonsService.findAll();
  }
}