import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { PolygonEntity } from '../../polygons/entities/polygon.entity';
import { Reclamation } from '../../reclamations/entities/reclamation.entity';

@Entity('clients')
export class Client {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  contractId: string;

  @Column({
    type: 'geometry',
    spatialFeatureType: 'Point',
    srid: 4326,
  })
  location: object;

  @ManyToOne(() => PolygonEntity, (polygon) => polygon.clients, {
    onDelete: 'RESTRICT',
  })
  polygon: PolygonEntity;

  @Column()
  polygonId: string;

  @OneToMany(() => Reclamation, (reclamation) => reclamation.client)
  reclamations: Reclamation[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}