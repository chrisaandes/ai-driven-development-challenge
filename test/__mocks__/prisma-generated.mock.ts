/**
 * Jest mock for @generated/prisma.
 *
 * The real generated client uses import.meta.url which is ESM-only and
 * incompatible with Jest's CommonJS transform. Since all tests mock the
 * PrismaService directly, this stub provides only the runtime values
 * actually needed during test execution.
 */

import { PrismaClientKnownRequestError } from '@prisma/client/runtime/client';

/** Stub for Prisma.sql tagged template (not invoked in unit tests). */
function sql(strings: TemplateStringsArray, ...values: unknown[]): object {
  return { strings, values };
}

/** Stub for PrismaClient base class (extended by PrismaService). */
class PrismaClient {}

export { PrismaClient };

export const Prisma = {
  sql,
  PrismaClientKnownRequestError,
};
