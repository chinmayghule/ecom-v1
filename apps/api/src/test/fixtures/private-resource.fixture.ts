import {
  Controller,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import { IsUUID } from 'class-validator';
import type { AuthenticatedUser } from '../../common/auth/auth.types';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { RequireCapability } from '../../common/authorization/require-capability.decorator';
import { PrismaModule } from '../../common/database/prisma.module';
import { PrismaService } from '../../common/database/prisma.service';

/**
 * TEST-ONLY fixture module. It lives under src/test/ (excluded from the Nest
 * production build) and is imported only by role/ownership e2e suites; the
 * production AppModule never imports it. When real store/order modules arrive
 * in later phases, they must adopt the same owner-scoped query pattern.
 */

export interface OwnedOrderView {
  readonly id: string;
  readonly status: string;
  readonly buyerUserId: string;
}

export class OrderIdParam {
  @IsUUID()
  readonly id!: string;
}

@Injectable()
export class PrivateResourceService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Ownership is enforced in the DATABASE predicate: the resource id and the
   * guard-resolved current local user id are supplied together. A foreign row
   * is never fetched and rejected later, so it cannot disclose any column.
   */
  async findOrderForOwner(
    id: string,
    currentUser: AuthenticatedUser,
  ): Promise<OwnedOrderView | undefined> {
    const row = await this.prisma.order.findFirst({
      where: { id, buyerUserId: currentUser.id },
      select: { id: true, status: true, buyerUserId: true },
    });
    return row ?? undefined;
  }
}

@Controller('private')
export class PrivateResourceController {
  constructor(private readonly resources: PrivateResourceService) {}

  /** Baseline authenticated route: any resolved local user may read their own row. */
  @Get('orders/:id')
  async readOwnOrder(
    @Param() params: OrderIdParam,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<OwnedOrderView> {
    const order = await this.resources.findOrderForOwner(params.id, user);
    if (order === undefined) {
      throw new NotFoundException('The requested resource was not found.');
    }
    return order;
  }

  /** Privileged route: server metadata only, never a client-supplied role. */
  @Post('admin/action')
  @RequireCapability('ADMIN')
  adminAction(@CurrentUser() user: AuthenticatedUser): { readonly ok: true; readonly actorId: string } {
    return { ok: true, actorId: user.id };
  }
}

@Module({
  imports: [PrismaModule],
  controllers: [PrivateResourceController],
  providers: [PrivateResourceService],
})
export class PrivateResourceFixtureModule {}
