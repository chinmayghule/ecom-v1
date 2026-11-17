import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../common/auth/auth.types';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { BEARER_SECURITY_SCHEME } from '../openapi';
import { UserProfileDto } from './dto/user-profile.dto';
import { IdentityService } from './identity.service';

/**
 * Thin HTTP layer for the current caller. The controller takes its identity
 * only from `@CurrentUser()` and asks the identity service for the projection;
 * it never decides ownership or capability and accepts no user identifier.
 */
@ApiTags('identity')
@Controller('users')
export class IdentityController {
  constructor(private readonly identityService: IdentityService) {}

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
}
