import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
  ForbiddenException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { AppRole } from '../../auth/roles.enum';
import { ReclamationsService } from '../reclamations.service';
import { CreateReclamationDto } from '../dto/create-reclamation.dto';
import { OperationActor } from '../../../common/interfaces/operation-actor.interface';

type AuthenticatedRequest = {
  user: {
    sub: string;
    email?: string;
    role: AppRole;
    zoneId?: string;
  };
};

@Controller('reclamations')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class ReclamationsController {
  constructor(private readonly reclamationsService: ReclamationsService) {}

  @Get()
  @Roles(AppRole.ADMIN, AppRole.RESPONSABLE_ZONE, AppRole.SERVICE_CLIENT)
  async findReclamations(@Req() req: AuthenticatedRequest) {
    const user = req.user;

    if (user.role === AppRole.ADMIN || user.role === AppRole.SERVICE_CLIENT) {
      return {
        message: 'All reclamations retrieved successfully',
        data: await this.reclamationsService.findAllReclamations(),
      };
    }

    if (user.role === AppRole.RESPONSABLE_ZONE && user.zoneId) {
      return {
        message: `Reclamations for zone ${user.zoneId} retrieved successfully`,
        data: await this.reclamationsService.findReclamationsByZone(user.zoneId),
      };
    }

    return {
      message: 'No reclamations available for this user',
      data: [],
    };
  }

  @Get('stats')
  @Roles(AppRole.ADMIN, AppRole.SERVICE_CLIENT)
  async getStats() {
    const stats = await this.reclamationsService.getReclamationStats();
    return {
      message: 'Reclamation statistics retrieved successfully',
      data: stats,
    };
  }

  @Get(':id')
  @Roles(AppRole.ADMIN, AppRole.RESPONSABLE_ZONE, AppRole.SERVICE_CLIENT)
  async findById(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    const rec = await this.reclamationsService.findById(id);
    if (
      req.user.role === AppRole.RESPONSABLE_ZONE &&
      req.user.zoneId &&
      rec.zoneId &&
      rec.zoneId !== req.user.zoneId
    ) {
      throw new ForbiddenException('This reclamation does not belong to your zone');
    }
    return {
      message: 'Reclamation retrieved successfully',
      data: rec,
    };
  }

  @Post()
  @Roles(AppRole.ADMIN, AppRole.SERVICE_CLIENT)
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateReclamationDto, @Req() req: AuthenticatedRequest) {
    const actor: OperationActor = {
      userId: req.user.sub,
      role: req.user.role,
      email: req.user.email,
      zoneId: req.user.zoneId,
    };
    const rec = await this.reclamationsService.createReclamation(dto, actor);
    return {
      message: 'Reclamation created successfully',
      data: rec,
    };
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
    await this.reclamationsService.deleteReclamation(id, actor);
    return { message: 'Reclamation deleted successfully' };
  }
}
