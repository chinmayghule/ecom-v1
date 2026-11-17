import { ApiProperty } from '@nestjs/swagger';
import type { ApplicationCapability } from '../../common/auth/auth.types';
import type { UserProfile } from '../identity.types';

const APPLICATION_CAPABILITIES = ['CUSTOMER', 'MERCHANT', 'ADMIN'] as const;

/**
 * Wire type for GET /users/me.
 *
 * Only these four fields are documented and returned. The Clerk subject,
 * tombstone, lifecycle audit and provider identifiers are intentionally absent
 * so a client can never observe another user's or the provider's internals.
 */
export class UserProfileDto implements UserProfile {
  @ApiProperty({
    format: 'uuid',
    description: 'Stable local user identifier, safe to use as a foreign key.',
  })
  readonly id!: string;

  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'Primary email copied from the verified session. Null only for an anonymized account.',
  })
  readonly email!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Required display name copied from the verified session. Null only when anonymized.',
  })
  readonly displayName!: string | null;

  @ApiProperty({
    type: () => [String],
    enum: APPLICATION_CAPABILITIES,
    description: 'Application-owned capabilities resolved from local state.',
  })
  readonly capabilities!: readonly ApplicationCapability[];
}
