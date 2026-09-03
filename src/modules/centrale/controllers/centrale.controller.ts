import {Controller,Get,Post,Patch,Delete,Param,Body,Req,UseGuards,HttpCode,HttpStatus,ForbiddenException,} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { AppRole } from '../../auth/roles.enum';
import { CentraleService } from '../services/centrale.service';
import { CreateCentraleDto } from '../dto/create-centrale.dto';
import { UpdateCentraleDto } from '../dto/update-centrale.dto';
import { OperationActor } from '../../../common/interfaces/operation-actor.interface';

type AuthenticatedRequest = {
  user: {
    sub: string;
    email?: string;
    role: AppRole;
    zoneId?: string;
  };
};

@Controller('centrales')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class CentraleController {
  constructor(private readonly centraleService: CentraleService) {}

  @Get()
  @Roles(AppRole.ADMIN, AppRole.RESPONSABLE_ZONE, AppRole.SERVICE_CLIENT)
  async findAll(@Req() req: AuthenticatedRequest) {
    const zoneId =
      req.user.role === AppRole.ADMIN || req.user.role === AppRole.SERVICE_CLIENT
        ? undefined
        : req.user.zoneId;
    return this.centraleService.findAll(zoneId);
  }

  private assertZoneAccess(req: AuthenticatedRequest, regionId: unknown): void {
    if (req.user.role === AppRole.ADMIN || req.user.role === AppRole.SERVICE_CLIENT) {
      return;
    }
    if (String(regionId) !== req.user.zoneId) {
      throw new ForbiddenException('This centrale does not belong to your zone');
    }
  }

  @Get(':id')
  @Roles(AppRole.ADMIN, AppRole.RESPONSABLE_ZONE, AppRole.SERVICE_CLIENT)
  async findById(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    const centrale = await this.centraleService.findById(id);
    this.assertZoneAccess(req, centrale.regionId);
    return centrale;
  }

  @Get(':id/nros')
  @Roles(AppRole.ADMIN, AppRole.RESPONSABLE_ZONE, AppRole.SERVICE_CLIENT)
  async getNros(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    const centrale = await this.centraleService.findById(id);
    this.assertZoneAccess(req, centrale.regionId);
    const nros = await this.centraleService.findNrosByCentrale(id);
    return { centraleId: centrale._id, nros };
  }

  @Get(':id/stats')
  @Roles(AppRole.ADMIN, AppRole.RESPONSABLE_ZONE, AppRole.SERVICE_CLIENT)
  async getStats(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    const centrale = await this.centraleService.findById(id);
    this.assertZoneAccess(req, centrale.regionId);
    return this.centraleService.getStats(id);
  }

  @Post()
  @Roles(AppRole.ADMIN, AppRole.SERVICE_CLIENT)
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateCentraleDto, @Req() req: AuthenticatedRequest) {
    const actor: OperationActor = {
      userId: req.user.sub,
      role: req.user.role,
      email: req.user.email,
      zoneId: req.user.zoneId,
    };
    return this.centraleService.create(dto, actor);
  }

  @Patch(':id')
  @Roles(AppRole.ADMIN)
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateCentraleDto,
  ) {
    return this.centraleService.update(id, dto);
  }

  @Delete(':id')
  @Roles(AppRole.ADMIN, AppRole.SERVICE_CLIENT)
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    const actor: OperationActor = {
      userId: req.user.sub,
      role: req.user.role,
      email: req.user.email,
      zoneId: req.user.zoneId,
    };
    await this.centraleService.delete(id, actor);
  }
}
