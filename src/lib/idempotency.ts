import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { IDEMPOTENCY_TTL_MS } from "@/lib/constants";

export type HandlerResult = {
  status: number;
  body: Record<string, unknown>;
};

export async function withIdempotency(
  key: string | null | undefined,
  scope: string,
  requestHash: string | undefined,
  handler: () => Promise<HandlerResult>
): Promise<HandlerResult> {
  if (!key?.trim()) {
    return handler();
  }

  const trimmedKey = key.trim();

  const existing = await prisma.idempotencyRecord.findUnique({
    where: { key_scope: { key: trimmedKey, scope } },
  });

  if (existing) {
    if (requestHash && existing.requestHash && existing.requestHash !== requestHash) {
      return {
        status: 422,
        body: {
          error: "Idempotency key reused with a different request payload",
        },
      };
    }
    return {
      status: existing.statusCode,
      body: existing.responseBody as Record<string, unknown>,
    };
  }

  const result = await handler();

  try {
    await prisma.idempotencyRecord.create({
      data: {
        key: trimmedKey,
        scope,
        requestHash: requestHash ?? null,
        statusCode: result.status,
        responseBody: result.body as Prisma.InputJsonValue,
        expiresAt: new Date(Date.now() + IDEMPOTENCY_TTL_MS),
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const raced = await prisma.idempotencyRecord.findUnique({
        where: { key_scope: { key: trimmedKey, scope } },
      });
      if (raced) {
        return {
          status: raced.statusCode,
          body: raced.responseBody as Record<string, unknown>,
        };
      }
    }
    throw error;
  }

  return result;
}

export function hashRequestBody(body: unknown): string {
  return JSON.stringify(body);
}
