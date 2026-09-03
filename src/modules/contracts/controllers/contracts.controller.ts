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
import { ContractsService } from '../contracts.service';
import { CreateContractDto } from '../dto/create-contract.dto';
import { OperationActor } from '../../../common/interfaces/operation-actor.interface';

type AuthenticatedRequest = {
  user: {
    sub: string;
    email?: string;
    role: AppRole;
    zoneId?: string;
  };
};

@Controller('contracts')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class ContractsController {
  constructor(private readonly contractsService: ContractsService) {}

  @Get()
  @Roles(AppRole.ADMIN, AppRole.RESPONSABLE_ZONE, AppRole.SERVICE_CLIENT)
  async findAll(@Req() req: AuthenticatedRequest) {
    const zoneId =
      req.user.role === AppRole.ADMIN || req.user.role === AppRole.SERVICE_CLIENT
        ? undefined
        : req.user.zoneId;
    const data = await this.contractsService.findAll(zoneId);
    return {
      message: 'Contracts retrieved successfully',
      data,
    };
  }

  @Get(':id')
  @Roles(AppRole.ADMIN, AppRole.RESPONSABLE_ZONE, AppRole.SERVICE_CLIENT)
  async findById(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    const contract = await this.contractsService.findById(id);
    if (
      req.user.role === AppRole.RESPONSABLE_ZONE &&
      req.user.zoneId &&
      contract.zoneId &&
      contract.zoneId !== req.user.zoneId &&
      contract.regionId !== req.user.zoneId
    ) {
      throw new ForbiddenException('This contract does not belong to your zone');
    }
    return {
      message: 'Contract retrieved successfully',
      data: contract,
    };
  }

  @Post()
  @Roles(AppRole.ADMIN, AppRole.SERVICE_CLIENT)
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateContractDto, @Req() req: AuthenticatedRequest) {
    const actor: OperationActor = {
      userId: req.user.sub,
      role: req.user.role,
      email: req.user.email,
      zoneId: req.user.zoneId,
    };
    const contract = await this.contractsService.createContract(dto, actor);
    return {
      message: 'Contract created successfully',
      data: contract,
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
    await this.contractsService.deleteContract(id, actor);
    return { message: 'Contract deleted successfully' };
  }
}
