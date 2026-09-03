import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CentralFiber, CentralFiberSchema } from './schemas/central-fiber.schema';
import { CentralFiberService } from './services/central-fiber.service';
import { CentralFiberController } from './controllers/central-fiber.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CentralFiber.name, schema: CentralFiberSchema },
    ]),
  ],
  providers: [CentralFiberService],
  controllers: [CentralFiberController],
  exports: [CentralFiberService],
})
export class CentralFiberModule {}
