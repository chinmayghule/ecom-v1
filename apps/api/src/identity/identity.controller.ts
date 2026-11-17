import { Body, Controller, Delete, Get, Res } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthenticatedUser } from '../common/auth/auth.types';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { BEARER_SECURITY_SCHEME } from '../openapi';
import {
  AccountDeletionRequestDto,
  AccountDeletionResultDto,
} from './dto/account-deletion.dto';
import { UserProfileDto } from './dto/user-profile.dto';
import { AccountLifecycleService } from './account-lifecycle.service';
import { IdentityService } from './identity.service';

/** Minimal library-specific response surface used to choose 204/202/409. */
interface DeletionResponse {
  status(code: number): { json(body: unknown): void; end(): void };
}

/**
 * Thin HTTP layer for the current caller. The controller takes its identity
 * only from `@CurrentUser()` and asks services for outcomes; it never decides
 * ownership or capability and accepts no target user identifier.
 */
@ApiTags('identity')
@Controller('users')
export class IdentityController {
  constructor(
    private readonly identityService: IdentityService,
    private readonly accountLifecycleService: AccountLifecycleService,
  ) {}

  @Get('me')
  @ApiBearerAuth(BEARER_SECURITY_SCHEME)
  @ApiOperation({ summary: 'Read the current local user profile' })
  @ApiOkResponse({
    type: UserProfileDto,
    description: 'The server-derived profile of the authenticated local user.',
  })
  currentProfile(@CurrentUser() user: AuthenticatedUser): UserProfileDto {
    return this.identityService.currentProfile(user);
  }

  @Delete('me')
  @ApiBearerAuth(BEARER_SECURITY_SCHEME)
  @ApiOperation({
    summary: 'Request anonymization or staged closure of the current account',
  })
  @ApiBody({ type: AccountDeletionRequestDto, required: false })
  @ApiNoContentResponse({
    description: 'Anonymization completed and provider revocation succeeded.',
  })
  @ApiResponse({
    status: 202,
    type: AccountDeletionResultDto,
    description: 'Closure accepted; anonymization waits for outstanding obligations.',
  })
  @ApiResponse({
    status: 409,
    type: AccountDeletionResultDto,
    description: 'Provider revocation failed; local access stays denied and is retried.',
  })
  async deleteAccount(
    @CurrentUser() user: AuthenticatedUser,
    @Body() _body: AccountDeletionRequestDto,
    @Res() response: DeletionResponse,
  ): Promise<void> {
    const result = await this.accountLifecycleService.deleteAccount(user);
    if (result.code === 'ACCOUNT_ANONYMIZED') {
      response.status(204).end();
      return;
    }
    const body: AccountDeletionResultDto = {
      code: result.code,
      lifecycleStatus: result.lifecycleStatus,
    };
    response.status(result.code === 'CLOSURE_ACCEPTED' ? 202 : 409).json(body);
  }
}
