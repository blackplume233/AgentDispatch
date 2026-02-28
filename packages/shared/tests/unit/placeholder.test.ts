import { describe, it, expect } from 'vitest';
import {
  VERSION,
  isValidTransition,
  AppError,
  NotFoundError,
  ConflictError,
  ValidationError,
  ErrorCode,
} from '../../src/index.js';

describe('shared', () => {
  it('should export VERSION', () => {
    expect(VERSION).toBe('0.0.1');
  });
});

describe('Task state machine', () => {
  it('should allow valid transitions', () => {
    expect(isValidTransition('pending', 'claimed')).toBe(true);
    expect(isValidTransition('claimed', 'in_progress')).toBe(true);
    expect(isValidTransition('in_progress', 'completed')).toBe(true);
    expect(isValidTransition('in_progress', 'failed')).toBe(true);
    expect(isValidTransition('failed', 'pending')).toBe(true);
    expect(isValidTransition('pending', 'cancelled')).toBe(true);
  });

  it('should reject invalid transitions', () => {
    expect(isValidTransition('pending', 'completed')).toBe(false);
    expect(isValidTransition('completed', 'pending')).toBe(false);
    expect(isValidTransition('cancelled', 'pending')).toBe(false);
    expect(isValidTransition('pending', 'in_progress')).toBe(false);
  });
});

describe('Error classes', () => {
  it('AppError should have correct properties', () => {
    const err = new AppError(ErrorCode.INTERNAL_ERROR, 'test error');
    expect(err.code).toBe('INTERNAL_ERROR');
    expect(err.statusCode).toBe(500);
    expect(err.message).toBe('test error');
    expect(err).toBeInstanceOf(Error);
  });

  it('NotFoundError should return 404', () => {
    const err = new NotFoundError(ErrorCode.TASK_NOT_FOUND, 'not found');
    expect(err.statusCode).toBe(404);
    expect(err.name).toBe('NotFoundError');
  });

  it('ConflictError should return 409', () => {
    const err = new ConflictError(ErrorCode.TASK_ALREADY_CLAIMED, 'conflict');
    expect(err.statusCode).toBe(409);
  });

  it('ValidationError should return 400', () => {
    const err = new ValidationError(ErrorCode.VALIDATION_ERROR, 'invalid');
    expect(err.statusCode).toBe(400);
  });
});
