import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Reclamation } from '../../reclamations/entities/reclamation.entity';
import { TicketStatus } from '../enums/ticket-status.enum';

@Entity('tickets')
export class Ticket {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  title: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'enum', enum: TicketStatus, default: TicketStatus.OPEN })
  status: TicketStatus;

  @ManyToOne(() => Reclamation, (reclamation) => reclamation.tickets, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  sourceReclamation?: Reclamation;

  @Column({ nullable: true })
  sourceReclamationId?: string;

  @Column({ nullable: true })
  polygonId?: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}