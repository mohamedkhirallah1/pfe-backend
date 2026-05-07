import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Zone } from '../../zones/entities/zone.entity';
import { Client } from '../../clients/entities/client.entity';

@Entity('polygons')
export class PolygonEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @ManyToOne(() => Zone, (zone) => zone.polygons, { onDelete: 'CASCADE' })
  zone: Zone;

  @Column()
  zoneId: string;

  @Column({
    type: 'geometry',
    spatialFeatureType: 'Polygon',
    srid: 4326,
  })
  boundary: object;

  @OneToMany(() => Client, (client) => client.polygon)
  clients: Client[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}