import {
  Injectable,
  ConflictException,
  BadRequestException,
  NotFoundException,
  Logger,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { User } from '../schemas/user.schema';
import { AppRole } from '../../auth/roles.enum';
import { CreateZoneManagerDto } from '../dto/create-zone-manager.dto';
import { UpdateZoneManagerDto } from '../dto/update-zone-manager.dto';
import { TUNISIA_REGIONS } from '../constants/tunisia-regions.constant';
import { Zone, ZoneDocument } from '../../zones/schemas/zone.schema';
import { normalizeTunisiaRegionName } from '../../zones/constants/tunisia-region-centers.constant';
import { MetricsService } from '../../../common/metrics/metrics.service';
import { QlogService } from '../../../common/qlog/qlog.service';
import { SupportedLanguage } from '../dto/update-language.dto';

export interface PublicUserDto {
  id: string;
  username: string;
  email?: string;
  role: AppRole;
  zoneId?: string;
  zoneName?: string;
  isActive: boolean;
  language: string;
}

@Injectable()
export class UsersService implements OnModuleInit {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectModel(User.name) private userModel: Model<User>,
    @InjectModel(Zone.name) private zoneModel: Model<ZoneDocument>,
    private readonly configService: ConfigService,
    @Optional() private readonly metricsService?: MetricsService,
    @Optional() private readonly qlog?: QlogService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.ensureDefaultAdmin();
  }

  /**
   * Opt-in only: bootstrapping an admin account with a configurable username/password.
   */
  private async ensureDefaultAdmin(): Promise<void> {
    if (this.configService.get<string>('SEED_DEFAULT_ADMIN') !== 'true') {
      return;
    }

    const adminUsername = this.configService.get<string>('DEFAULT_ADMIN_USERNAME');
    const adminPassword = this.configService.get<string>('DEFAULT_ADMIN_PASSWORD');
    const adminEmail = this.configService.get<string>(
      'DEFAULT_ADMIN_EMAIL',
      'admin@smartfiber.tn',
    )?.trim().toLowerCase();

    if (!adminUsername || !adminPassword) {
      this.logger.warn(
        'SEED_DEFAULT_ADMIN=true but DEFAULT_ADMIN_USERNAME/DEFAULT_ADMIN_PASSWORD are not set; skipping admin bootstrap. Use "npm run seed" to create the initial admin instead.',
      );
      return;
    }

    if (adminPassword.length < 8) {
      this.logger.error(
        'DEFAULT_ADMIN_PASSWORD is too short (min 8 characters); skipping admin bootstrap.',
      );
      return;
    }

    const admin = await this.userModel.findOne({ username: adminUsername });
    if (admin) {
      // If admin exists but lacks email, backfill it
      if (!admin.email && adminEmail) {
        admin.email = adminEmail;
        await admin.save();
      }
      return;
    }

    const hashedPassword = await bcrypt.hash(adminPassword, 10);
    await this.userModel.create({
      username: adminUsername,
      email: adminEmail,
      password: hashedPassword,
      role: AppRole.ADMIN,
      isActive: true,
    });

    this.logger.log(`Default admin account "${adminUsername}" created from environment configuration.`);
  }

  private toPublicUser(user: User): PublicUserDto {
    return {
      id: user._id.toString(),
      username: user.username,
      email: user.email,
      role: user.role,
      zoneId: user.zoneId,
      isActive: user.isActive,
      language: user.language ?? 'fr',
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
  ): Promise<PublicUserDto> {
    const { username, email, password, zoneId } = createZoneManagerDto;
    const normalizedUsername = username.trim();
    const normalizedEmail = email ? email.trim().toLowerCase() : '';
    const regionName = normalizeTunisiaRegionName(zoneId ?? '');

    // 1. Check if username already exists
    const existingUser = await this.userModel.findOne({ username: normalizedUsername });
    if (existingUser) {
      throw new ConflictException(
        `Zone manager with username "${normalizedUsername}" already exists`,
      );
    }

    // 2. Check if email already exists
    if (!normalizedEmail) {
      throw new BadRequestException('Email is required for zone manager');
    }

    const existingEmailUser = await this.userModel.findOne({ email: normalizedEmail });
    if (existingEmailUser) {
      throw new ConflictException(
        `User with email "${normalizedEmail}" already exists`,
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

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create new user
    const newUser = new this.userModel({
      username: normalizedUsername,
      email: normalizedEmail,
      password: hashedPassword,
      role: AppRole.RESPONSABLE_ZONE,
      zoneId: zoneObjectId,
      isActive: true,
    });

    const savedUser = await newUser.save();

    await this.zoneModel.findByIdAndUpdate(zoneObjectId, {
      managerUserId: savedUser._id.toString(),
    });

    this.metricsService?.recordUserOperation(
      'created',
      savedUser.username,
      savedUser.role,
    );

    return {
      ...this.toPublicUser(savedUser),
      zoneName: zone.name,
    };
  }

  async updateZoneManager(
    id: string,
    dto: UpdateZoneManagerDto,
  ): Promise<PublicUserDto> {
    const zoneManager = await this.userModel.findById(id);

    if (!zoneManager || zoneManager.role !== AppRole.RESPONSABLE_ZONE) {
      throw new NotFoundException('Zone manager not found');
    }

    if (dto.username) {
      const normalizedUsername = dto.username.trim();
      if (normalizedUsername !== zoneManager.username) {
        const usernameExists = await this.userModel.findOne({ username: normalizedUsername });
        if (usernameExists) {
          throw new ConflictException(`Username "${normalizedUsername}" is already used`);
        }
        zoneManager.username = normalizedUsername;
      }
    }

    if (dto.email) {
      const normalizedEmail = dto.email.trim().toLowerCase();
      if (normalizedEmail !== zoneManager.email) {
        const emailExists = await this.userModel.findOne({
          _id: { $ne: zoneManager._id },
          email: normalizedEmail,
        });
        if (emailExists) {
          throw new ConflictException(`Email "${normalizedEmail}" is already used`);
        }
        zoneManager.email = normalizedEmail;
      }
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

    this.metricsService?.recordUserOperation('updated', saved.username, saved.role);

    let zoneName: string | undefined;
    if (saved.zoneId) {
      if (Types.ObjectId.isValid(saved.zoneId)) {
        zoneName = (await this.zoneModel.findById(saved.zoneId).exec())?.name;
      }
      if (!zoneName) {
        const normalized = normalizeTunisiaRegionName(saved.zoneId);
        zoneName = normalized
          ? (await this.zoneModel.findOne({ name: normalized }).exec())?.name ?? normalized
          : saved.zoneId;
      }
    }

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

    if (zoneManager.zoneId && Types.ObjectId.isValid(zoneManager.zoneId)) {
      await this.zoneModel.findByIdAndUpdate(zoneManager.zoneId, {
        $unset: { managerUserId: '' },
      });
    }

    zoneManager.isActive = false;
    await zoneManager.save();

    this.metricsService?.recordUserOperation('deleted', zoneManager.username, zoneManager.role);
  }

  async findByUsername(username: string): Promise<User | null> {
    return this.userModel.findOne({ username });
  }

  async findById(id: string): Promise<User | null> {
    return this.userModel.findById(id);
  }

  async findAll(): Promise<PublicUserDto[]> {
    const users = await this.userModel.find({ isActive: true }).select('-password');
    return users.map((user) => this.toPublicUser(user));
  }

  async findZoneManagers(): Promise<PublicUserDto[]> {
    const users = await this.userModel
      .find({
        role: AppRole.RESPONSABLE_ZONE,
        isActive: true,
      })
      .select('-password');

    // Retrieve all active zones for fast in-memory resolution by ID, exact name, or normalized ISO name
    const allZones = await this.zoneModel.find({ isActive: true }).exec();
    const zoneByIdMap = new Map<string, ZoneDocument>();
    const zoneByNameMap = new Map<string, ZoneDocument>();

    for (const zone of allZones) {
      zoneByIdMap.set(zone._id.toString(), zone);
      zoneByNameMap.set(zone.name.toLowerCase(), zone);
    }

    return users.map((user) => {
      let zoneName: string | undefined;
      const rawZoneId = user.zoneId;

      if (rawZoneId) {
        // 1. Direct match by ObjectId
        if (zoneByIdMap.has(rawZoneId)) {
          zoneName = zoneByIdMap.get(rawZoneId)!.name;
        } else {
          // 2. Direct match by zone name
          const byName = zoneByNameMap.get(rawZoneId.toLowerCase());
          if (byName) {
            zoneName = byName.name;
          } else {
            // 3. Match via normalized region name / ISO code (e.g. 'TN-41' -> 'Kairouan')
            const normalizedRegion = normalizeTunisiaRegionName(rawZoneId);
            if (normalizedRegion && zoneByNameMap.has(normalizedRegion.toLowerCase())) {
              zoneName = zoneByNameMap.get(normalizedRegion.toLowerCase())!.name;
            } else {
              zoneName = normalizedRegion ?? rawZoneId;
            }
          }
        }
      }

      return {
        ...this.toPublicUser(user as User),
        zoneName,
      };
    });
  }

  async findManagerByZoneId(zoneId: string): Promise<User | null> {
    return this.userModel.findOne({
      role: AppRole.RESPONSABLE_ZONE,
      zoneId,
      isActive: true,
    });
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

  async updateLanguage(
    userId: string,
    language: SupportedLanguage,
  ): Promise<{ language: SupportedLanguage }> {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    user.language = language;
    await user.save();

    this.qlog?.info(`User language updated to "${language}"`, 'UsersService', {
      event: 'USER_LANGUAGE_UPDATED',
      userId: user._id.toString(),
      language,
      role: user.role,
    });

    return { language };
  }

  async getProfile(userId: string): Promise<PublicUserDto> {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    let zoneName: string | undefined;
    if (user.zoneId) {
      if (Types.ObjectId.isValid(user.zoneId)) {
        zoneName = (await this.zoneModel.findById(user.zoneId).exec())?.name;
      }
      if (!zoneName) {
        const normalized = normalizeTunisiaRegionName(user.zoneId);
        zoneName = normalized
          ? (await this.zoneModel.findOne({ name: normalized }).exec())?.name ?? normalized
          : user.zoneId;
      }
    }

    return {
      ...this.toPublicUser(user),
      zoneName,
    };
  }
}
