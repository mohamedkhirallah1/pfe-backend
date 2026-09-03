import { Controller, Get, Post, Body, Patch, Delete, Param, UseGuards, HttpCode, Req, ForbiddenException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { AppRole } from '../../auth/roles.enum';
import { CentralFiberService } from '../services/central-fiber.service';
import { CreateCentralFiberDto, UpdateCentralFiberDto } from '../dto/central-fiber.dto';

@Controller('central-fibers')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(AppRole.ADMIN, AppRole.RESPONSABLE_ZONE)
export class CentralFiberController {
  constructor(private readonly centralFiberService: CentralFiberService) {}

  @Post()
  @Roles(AppRole.ADMIN)
  @HttpCode(201)
  async create(@Body() dto: CreateCentralFiberDto) {
    const site = await this.centralFiberService.create(dto);
    return {
      message: 'Central Fiber created successfully',
      data: site,
    };
  }

  @Get()
  async findAll(@Req() req: any) {
    const user = req.user;
    let sites;

    if (user.role === AppRole.ADMIN) {
      sites = await this.centralFiberService.findAll();
    } else if (user.role === AppRole.RESPONSABLE_ZONE && user.zoneId) {
      sites = await this.centralFiberService.findByZoneId(user.zoneId);
    } else {
      sites = [];
    }

    return {
      message: 'Central Fibers retrieved successfully',
      data: sites,
    };
  }

  @Get('stats')
  @Roles(AppRole.ADMIN)
  async getStats() {
    const stats = await this.centralFiberService.getSaturationStats();
    return {
      message: 'Central Fiber statistics retrieved successfully',
      data: stats,
    };
  }

  @Get(':id')
  async findById(@Param('id') id: string, @Req() req: any) {
    const site = await this.centralFiberService.findById(id);
    if (!site) {
      return {
        message: 'Central Fiber not found',
        data: null,
      };
    }

    if (req.user.role !== AppRole.ADMIN && site.zoneId !== req.user.zoneId) {
      throw new ForbiddenException('This central fiber does not belong to your zone');
    }

    return {
      message: 'Central Fiber retrieved successfully',
      data: site,
    };
  }

  @Patch(':id')
  @Roles(AppRole.ADMIN)
  async update(@Param('id') id: string, @Body() dto: UpdateCentralFiberDto) {
    const site = await this.centralFiberService.update(id, dto);
    return {
      message: 'Central Fiber updated successfully',
      data: site,
    };
  }

  @Delete(':id')
  @Roles(AppRole.ADMIN)
  @HttpCode(200)
  async delete(@Param('id') id: string) {
    await this.centralFiberService.delete(id);
    return {
      message: 'Central Fiber deleted successfully',
    };
  }
}
