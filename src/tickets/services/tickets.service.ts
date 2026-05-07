import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Reclamation } from '../../reclamations/entities/reclamation.entity';
import { CreateTicketDto } from '../dto/create-ticket.dto';
import { Ticket } from '../entities/ticket.entity';

@Injectable()
export class TicketsService {
  constructor(
    @InjectRepository(Ticket)
    private readonly ticketsRepository: Repository<Ticket>,
  ) {}

  create(createTicketDto: CreateTicketDto): Promise<Ticket> {
    const ticket = this.ticketsRepository.create(createTicketDto);
    return this.ticketsRepository.save(ticket);
  }

  findAll(): Promise<Ticket[]> {
    return this.ticketsRepository.find({ relations: ['sourceReclamation'] });
  }

  createFromReclamation(
    reclamation: Reclamation,
    openReclamationsCount: number,
  ): Promise<Ticket> {
    const ticket = this.ticketsRepository.create({
      title: `Auto ticket for polygon ${reclamation.polygonId}`,
      description: `Threshold reached: ${openReclamationsCount} open reclamations for polygon ${reclamation.polygonId}`,
      sourceReclamationId: reclamation.id,
      polygonId: reclamation.polygonId,
    });

    return this.ticketsRepository.save(ticket);
  }
}