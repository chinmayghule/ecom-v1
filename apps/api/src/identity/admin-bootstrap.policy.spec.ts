import { describe, expect, it } from 'vitest';
import { isAdminOnFirstCreate, normalizeEmail } from './admin-bootstrap.policy';

const ALLOWLIST: readonly string[] = ['Owner@Example.test', 'second@example.test'];

describe('first-create admin bootstrap policy (pure)', () => {
  it('normalizes email addresses for exact comparison', () => {
    expect(normalizeEmail('  Owner@Example.TEST ')).toBe('owner@example.test');
    expect(normalizeEmail('')).toBe('');
  });

  it('grants admin only for a verified allowlisted email', () => {
    expect(
      isAdminOnFirstCreate('owner@example.test', true, ALLOWLIST),
    ).toBe(true);
    expect(
      isAdminOnFirstCreate('  OWNER@example.test  ', true, ALLOWLIST),
    ).toBe(true);
  });

  it('does not grant admin for an unverified email even when it is allowlisted', () => {
    expect(isAdminOnFirstCreate('owner@example.test', false, ALLOWLIST)).toBe(false);
  });

  it('does not grant admin for a verified email outside the allowlist', () => {
    expect(isAdminOnFirstCreate('attacker@example.test', true, ALLOWLIST)).toBe(false);
  });

  it('does not grant admin for an empty email or an empty allowlist', () => {
    expect(isAdminOnFirstCreate('   ', true, ALLOWLIST)).toBe(false);
    expect(isAdminOnFirstCreate('owner@example.test', true, [])).toBe(false);
  });

  it('matches the whole normalized address, not a substring or domain suffix', () => {
    expect(isAdminOnFirstCreate('notowner@example.test', true, ALLOWLIST)).toBe(false);
    expect(isAdminOnFirstCreate('owner@example.test.evil', true, ALLOWLIST)).toBe(false);
  });
});
