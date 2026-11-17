import { Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/** Provides the single application-wide database client. */
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
