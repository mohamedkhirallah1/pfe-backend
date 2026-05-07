import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Client } from '../../clients/entities/client.entity';
import { Ticket } from '../../tickets/entities/ticket.entity';
import { ReclamationStatus } from '../enums/reclamation-status.enum';

@Entity('reclamations')
export class Reclamation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  crmReference: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'enum', enum: ReclamationStatus, default: ReclamationStatus.OPEN })
  status: ReclamationStatus;

  @ManyToOne(() => Client, (client) => client.reclamations, { onDelete: 'CASCADE' })
  client: Client;

  @Column()
  clientId: string;

  @Column()
  polygonId: string;

  @OneToMany(() => Ticket, (ticket) => ticket.sourceReclamation)
  tickets: Ticket[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
