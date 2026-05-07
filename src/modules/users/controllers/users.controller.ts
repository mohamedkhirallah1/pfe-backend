import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  HttpCode,
  Patch,
  Param,
  Delete,
} from '@nestjs/common';
import { UsersService } from '../services/users.service';
import { CreateZoneManagerDto } from '../dto/create-zone-manager.dto';
import { UpdateZoneManagerDto } from '../dto/update-zone-manager.dto';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { AppRole } from '../../auth/roles.enum';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';

// Admin endpoints for managing zone managers
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post('zone-managers')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(AppRole.ADMIN)
  @HttpCode(201)
  async createZoneManager(
    @Body() createZoneManagerDto: CreateZoneManagerDto,
  ): Promise<{ message: string; data: any }> {
    const zoneManager = await this.usersService.createZoneManager(
      createZoneManagerDto,
    );
    return {
      message: 'Zone manager created successfully',
      data: zoneManager,
    };
  }

  @Get('zone-managers')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(AppRole.ADMIN)
  async getZoneManagers(): Promise<{ message: string; data: any[] }> {
    const zoneManagers = await this.usersService.findZoneManagers();
    return {
      message: 'Zone managers retrieved successfully',
      data: zoneManagers,
    };
  }

  @Patch('zone-managers/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(AppRole.ADMIN)
  async updateZoneManager(
    @Param('id') id: string,
    @Body() updateZoneManagerDto: UpdateZoneManagerDto,
  ): Promise<{ message: string; data: any }> {
    const zoneManager = await this.usersService.updateZoneManager(
      id,
      updateZoneManagerDto,
    );
    return {
      message: 'Zone manager updated successfully',
      data: zoneManager,
    };
  }

  @Delete('zone-managers/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(AppRole.ADMIN)
  @HttpCode(200)
  async deleteZoneManager(@Param('id') id: string): Promise<{ message: string }> {
    await this.usersService.deleteZoneManager(id);
    return {
      message: 'Zone manager deleted successfully',
    };
  }

  @Get('regions')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(AppRole.ADMIN)
  async getTunisiaRegions(): Promise<{ message: string; data: readonly string[] }> {
    return {
      message: 'Tunisia regions retrieved successfully',
      data: this.usersService.getTunisiaRegions(),
    };
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(AppRole.ADMIN)
  async getAllUsers(): Promise<{ message: string; data: any[] }> {
    const users = await this.usersService.findAll();
    return {
      message: 'Users retrieved successfully',
      data: users,
    };
  }
}
