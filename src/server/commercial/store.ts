/**
 * Compatibility façade over commercial repositories.
 * Prefer getRepositories() for new code.
 */

import type { CommercialRequest, PendingCommercialIntent } from "@/domain/commercial/types";
import { getRepositories, type StoredUser } from "./repos";

export type { StoredUser };

export async function resetCommercialStoreForTests(): Promise<void> {
  const { resetCommercialStoreForTests: reset } = await import("./repos");
  await reset();
}

export async function findUserByEmail(email: string): Promise<StoredUser | undefined> {
  return getRepositories().users.findByEmail(email);
}

export async function findUserById(id: string): Promise<StoredUser | undefined> {
  return getRepositories().users.findById(id);
}

export async function createUser(
  user: Omit<StoredUser, "createdAt" | "updatedAt"> & {
    createdAt?: string;
    updatedAt?: string;
  },
): Promise<StoredUser> {
  const now = new Date().toISOString();
  const record: StoredUser = {
    ...user,
    email: user.email.trim().toLowerCase(),
    createdAt: user.createdAt ?? now,
    updatedAt: user.updatedAt ?? now,
  };
  return getRepositories().users.create(record);
}

export async function saveIntent(intent: PendingCommercialIntent): Promise<void> {
  await getRepositories().intents.save(intent);
}

export async function getIntent(
  id: string,
): Promise<PendingCommercialIntent | undefined> {
  return getRepositories().intents.get(id);
}

export async function deleteIntent(id: string): Promise<void> {
  await getRepositories().intents.delete(id);
}

export async function saveRequest(request: CommercialRequest): Promise<CommercialRequest> {
  return getRepositories().requests.save(request);
}

export async function getRequest(
  id: string,
): Promise<CommercialRequest | undefined> {
  return getRepositories().requests.get(id);
}

export async function listRequestsForUser(userId: string): Promise<CommercialRequest[]> {
  return getRepositories().requests.listForUser(userId);
}
