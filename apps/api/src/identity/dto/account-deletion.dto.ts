import { ApiProperty } from '@nestjs/swagger';
import { IsEmpty, IsOptional } from 'class-validator';
import type {
  AccountDeletionCode,
  UserLifecycleStatus,
} from '../account-lifecycle.types';

export const ACCOUNT_DELETION_CODES = [
  'ACCOUNT_ANONYMIZED',
  'CLOSURE_ACCEPTED',
  'PROVIDER_REVOCATION_FAILED',
] as const;

export const ACCOUNT_LIFECYCLE_STATUSES = [
  'ACTIVE',
  'CLOSURE_REQUESTED',
  'CLOSURE_ACCEPTED',
  'ANONYMIZED',
] as const;

/**
 * DELETE /users/me accepts no client input. The single guarded field gives
 * the global validation pipe metadata to validate against, so any supplied
 * user id, role or owner field is rejected at the boundary (T-08-02). The
 * target user is derived only from the @CurrentUser decorator.
 */
export class AccountDeletionRequestDto {
  @ApiProperty({ required: false, type: String, description: 'Never accepted; must be empty.' })
  @IsOptional()
  @IsEmpty()
  readonly userId?: string;
}

/** Non-sensitive outcome returned for pending (202) and conflict (409) cases. */
export class AccountDeletionResultDto {
  @ApiProperty({
    enum: ACCOUNT_DELETION_CODES,
    description: 'Stable outcome code; never a provider or internal message.',
  })
  readonly code!: AccountDeletionCode;

  @ApiProperty({
    enum: ACCOUNT_LIFECYCLE_STATUSES,
    description: 'Non-sensitive lifecycle status of the local account.',
  })
  readonly lifecycleStatus!: UserLifecycleStatus;
}
