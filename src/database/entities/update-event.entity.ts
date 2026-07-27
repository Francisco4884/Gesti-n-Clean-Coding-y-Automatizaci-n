import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('update_events')
export class UpdateEventEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column({ nullable: true })
  source: string;

  @Index()
  @Column({ nullable: true })
  entity: string;

  @Column({ nullable: true })
  action: string;

  @Column({ nullable: true })
  title: string;

  @Column({ nullable: true })
  description: string;

  @Column({ type: 'text', nullable: true })
  payload: string;

  @Index()
  @Column({ type: 'datetime', nullable: true })
  occurred_at: Date;
}
