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
import { CreateNroDto } from '../dto/create-nro.dto';
import { UpdateNroDto } from '../dto/update-nro.dto';
import { NroService } from '../nro.service';
import { OperationActor } from '../../../common/interfaces/operation-actor.interface';

type AuthenticatedRequest = {
  user: {
    sub: string;
    email?: string;
    role: AppRole;
    zoneId?: string;
  };
};

@Controller('nros')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(AppRole.ADMIN, AppRole.RESPONSABLE_ZONE, AppRole.SERVICE_CLIENT)
export class NroController {
  constructor(private readonly nroService: NroService) {}

  @Get()
  async findAll(@Req() req: AuthenticatedRequest) {
    const regionId =
      req.user.role === AppRole.ADMIN || req.user.role === AppRole.SERVICE_CLIENT
        ? undefined
        : req.user.zoneId;
    return this.nroService.findAll(regionId);
  }

  @Get(':id')
  async findById(@Param('id') id: string) {
    return this.nroService.findById(id);
  }

  @Post()
  @Roles(AppRole.ADMIN, AppRole.SERVICE_CLIENT)
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateNroDto, @Req() req: AuthenticatedRequest) {
    const actor: OperationActor = {
      userId: req.user.sub,
      role: req.user.role,
      email: req.user.email,
      zoneId: req.user.zoneId,
    };
    return this.nroService.create(dto, actor);
  }

  @Patch(':id')
  @Roles(AppRole.ADMIN)
  async update(@Param('id') id: string, @Body() dto: UpdateNroDto) {
    return this.nroService.update(id, dto);
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
    await this.nroService.remove(id, actor);
    return { message: 'NRO deleted successfully' };
  }
}
