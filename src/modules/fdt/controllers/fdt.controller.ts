import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { AppRole } from '../../auth/roles.enum';
import { CreateFdtDto } from '../dto/create-fdt.dto';
import { UpdateFdtDto } from '../dto/update-fdt.dto';
import { FdtService } from '../fdt.service';
import { OperationActor } from '../../../common/interfaces/operation-actor.interface';

type AuthenticatedRequest = {
  user: {
    sub: string;
    email?: string;
    role: AppRole;
    zoneId?: string;
  };
};

@Controller('fdts')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(AppRole.ADMIN, AppRole.RESPONSABLE_ZONE, AppRole.SERVICE_CLIENT)
export class FdtController {
  constructor(private readonly fdtService: FdtService) {}

  @Get()
  async findAll(@Req() req: AuthenticatedRequest) {
    const regionId =
      req.user.role === AppRole.ADMIN || req.user.role === AppRole.SERVICE_CLIENT
        ? undefined
        : req.user.zoneId;
    return this.fdtService.findAll(regionId);
  }

  @Get(':id')
  async findById(@Param('id') id: string) {
    return this.fdtService.findById(id);
  }

  @Post()
  @Roles(AppRole.ADMIN, AppRole.SERVICE_CLIENT)
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateFdtDto, @Req() req: AuthenticatedRequest) {
    const actor: OperationActor = {
      userId: req.user.sub,
      role: req.user.role,
      email: req.user.email,
      zoneId: req.user.zoneId,
    };
    return this.fdtService.create(dto, actor);
  }

  @Patch(':id')
  @Roles(AppRole.ADMIN)
  async update(@Param('id') id: string, @Body() dto: UpdateFdtDto) {
    return this.fdtService.update(id, dto);
  }

  @Delete(':id')
  @Roles(AppRole.ADMIN, AppRole.SERVICE_CLIENT)
  @HttpCode(HttpStatus.OK)
  async remove(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    const actor: OperationActor = {
      userId: req.user.sub,
      role: req.user.role,
      email: req.user.email,
      zoneId: req.user.zoneId,
    };
    await this.fdtService.remove(id, actor);
    return { message: 'FDT deleted successfully' };
  }
}
