import {
  Injectable,
  ConflictException,
  BadRequestException,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { User } from '../schemas/user.schema';
import { AppRole } from '../../auth/roles.enum';
import { CreateZoneManagerDto } from '../dto/create-zone-manager.dto';
import { UpdateZoneManagerDto } from '../dto/update-zone-manager.dto';
import { TUNISIA_REGIONS } from '../constants/tunisia-regions.constant';
import { Zone, ZoneDocument } from '../../zones/schemas/zone.schema';
import { normalizeTunisiaRegionName } from '../../zones/constants/tunisia-region-centers.constant';

@Injectable()
export class UsersService implements OnModuleInit {
  constructor(
    @InjectModel(User.name) private userModel: Model<User>,
    @InjectModel(Zone.name) private zoneModel: Model<ZoneDocument>,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.ensureDefaultAdmin();
  }

  private async ensureDefaultAdmin(): Promise<void> {
    const adminUsername = this.configService.get<string>('DEFAULT_ADMIN_USERNAME', 'admin');
    const adminPassword = this.configService.get<string>('DEFAULT_ADMIN_PASSWORD', 'admin1234');

    const admin = await this.userModel.findOne({ username: adminUsername });
    if (admin) {
      return;
    }

    const hashedPassword = await bcrypt.hash(adminPassword, 10);
    await this.userModel.create({
      username: adminUsername,
      password: hashedPassword,
      role: AppRole.ADMIN,
      isActive: true,
    });
  }

  private toPublicUser(user: User): {
    id: string;
    username: string;
    role: AppRole;
    zoneId?: string;
    zoneName?: string;
    isActive: boolean;
  } {
    return {
      id: user._id.toString(),
      username: user.username,
      role: user.role,
      zoneId: user.zoneId,
      isActive: user.isActive,
    };
  }

  private async getZoneByRegionName(regionName: string): Promise<ZoneDocument> {
    const zone = await this.zoneModel.findOne({ name: regionName, isActive: true }).exec();

    if (!zone) {
      throw new BadRequestException(
        `Zone map for "${regionName}" does not exist yet. Create the zone map first.`,
      );
    }

    return zone;
  }

  async createZoneManager(
    createZoneManagerDto: CreateZoneManagerDto,
  ): Promise<{
    id: string;
    username: string;
    role: AppRole;
    zoneId?: string;
    zoneName?: string;
    isActive: boolean;
  }> {
    const { username, password, zoneId } = createZoneManagerDto;
    const regionName = normalizeTunisiaRegionName(zoneId ?? '');

    // Vérifier si l'utilisateur existe déjà
    const existingUser = await this.userModel.findOne({ username });
    if (existingUser) {
      throw new ConflictException(
        `Zone manager with username "${username}" already exists`,
      );
    }

    if (!zoneId || zoneId.trim() === '') {
      throw new BadRequestException('Zone ID is required');
    }

    if (!regionName || !TUNISIA_REGIONS.includes(regionName)) {
      throw new BadRequestException('Zone ID must be one of the 24 Tunisia regions');
    }

    const zone = await this.getZoneByRegionName(regionName);
    const zoneObjectId = zone._id.toString();

    const existingZoneManager = await this.userModel.findOne({
      role: AppRole.RESPONSABLE_ZONE,
      zoneId: zoneObjectId,
      isActive: true,
    });
    if (existingZoneManager) {
      throw new ConflictException(`A zone manager already exists for zone "${regionName}"`);
    }

    // Hasher le mot de passe
    const hashedPassword = await bcrypt.hash(password, 10);

    // Créer le nouvel utilisateur
    const newUser = new this.userModel({
      username,
      password: hashedPassword,
      role: AppRole.RESPONSABLE_ZONE,
      zoneId: zoneObjectId,
      isActive: true,
    });

    const savedUser = await newUser.save();

    await this.zoneModel.findByIdAndUpdate(zoneObjectId, {
      managerUserId: savedUser._id.toString(),
    });

    return {
      ...this.toPublicUser(savedUser),
      zoneName: zone.name,
    };
  }

  async updateZoneManager(
    id: string,
    dto: UpdateZoneManagerDto,
  ): Promise<{
    id: string;
    username: string;
    role: AppRole;
    zoneId?: string;
    zoneName?: string;
    isActive: boolean;
  }> {
    const zoneManager = await this.userModel.findById(id);

    if (!zoneManager || zoneManager.role !== AppRole.RESPONSABLE_ZONE) {
      throw new NotFoundException('Zone manager not found');
    }

    if (dto.username && dto.username !== zoneManager.username) {
      const usernameExists = await this.userModel.findOne({ username: dto.username });
      if (usernameExists) {
        throw new ConflictException(`Username "${dto.username}" is already used`);
      }
      zoneManager.username = dto.username;
    }

    if (dto.zoneId) {
      const normalizedRegionName = normalizeTunisiaRegionName(dto.zoneId);
      if (!normalizedRegionName || !TUNISIA_REGIONS.includes(normalizedRegionName)) {
        throw new BadRequestException('Zone ID must be one of the 24 Tunisia regions');
      }

      const nextZone = await this.getZoneByRegionName(normalizedRegionName);
      const nextZoneId = nextZone._id.toString();

      const zoneTaken = await this.userModel.findOne({
        _id: { $ne: zoneManager._id },
        role: AppRole.RESPONSABLE_ZONE,
        zoneId: nextZoneId,
        isActive: true,
      });
      if (zoneTaken) {
        throw new ConflictException(`A zone manager already exists for zone "${normalizedRegionName}"`);
      }

      if (zoneManager.zoneId && zoneManager.zoneId !== nextZoneId) {
        await this.zoneModel.findByIdAndUpdate(zoneManager.zoneId, {
          $unset: { managerUserId: '' },
        });
      }

      zoneManager.zoneId = nextZoneId;
      await this.zoneModel.findByIdAndUpdate(nextZoneId, {
        managerUserId: zoneManager._id.toString(),
      });
    }

    if (dto.password) {
      zoneManager.password = await bcrypt.hash(dto.password, 10);
    }

    if (dto.isActive !== undefined) {
      zoneManager.isActive = dto.isActive;
    }

    const saved = await zoneManager.save();

    const zoneName = saved.zoneId
      ? (await this.zoneModel.findById(saved.zoneId).exec())?.name
      : undefined;

    return {
      ...this.toPublicUser(saved),
      zoneName,
    };
  }

  async deleteZoneManager(id: string): Promise<void> {
    const zoneManager = await this.userModel.findById(id);

    if (!zoneManager || zoneManager.role !== AppRole.RESPONSABLE_ZONE) {
      throw new NotFoundException('Zone manager not found');
    }

    if (zoneManager.zoneId) {
      await this.zoneModel.findByIdAndUpdate(zoneManager.zoneId, {
        $unset: { managerUserId: '' },
      });
    }

    zoneManager.isActive = false;
    await zoneManager.save();
  }

  async findByUsername(username: string): Promise<User | null> {
    return this.userModel.findOne({ username });
  }

  async findById(id: string): Promise<User | null> {
    return this.userModel.findById(id);
  }

  async findAll(): Promise<User[]> {
    return this.userModel.find({ isActive: true }).select('-password');
  }

  async findZoneManagers(): Promise<
    Array<{
      id: string;
      username: string;
      role: AppRole;
      zoneId?: string;
      zoneName?: string;
      isActive: boolean;
    }>
  > {
    const users = await this.userModel
      .find({
        role: AppRole.RESPONSABLE_ZONE,
        isActive: true,
      })
      .select('-password');

    const zoneIds = users
      .map((user) => user.zoneId)
      .filter((id): id is string => !!id);

    const zones = await this.zoneModel.find({ _id: { $in: zoneIds } }).exec();
    const zoneNameMap = new Map(zones.map((zone) => [zone._id.toString(), zone.name]));

    return users.map((user) => ({
      ...this.toPublicUser(user as User),
      zoneName: user.zoneId ? zoneNameMap.get(user.zoneId) : undefined,
    }));
  }

  getTunisiaRegions(): readonly string[] {
    return TUNISIA_REGIONS;
  }

  async validatePassword(
    plainPassword: string,
    hashedPassword: string,
  ): Promise<boolean> {
    return bcrypt.compare(plainPassword, hashedPassword);
  }
}

