import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class HealthService {
  constructor(private readonly dataSource: DataSource) {}

  async check() {
    try {
      // Consulta minima real: valida que la conexion con SQLite responda
      await this.dataSource.query('SELECT 1');
    } catch {
      throw new HttpException(
        { status: 'error' },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    return { status: 'ok', timestamp: new Date().toLocaleString() };
  }
}
