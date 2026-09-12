import { createHash, randomBytes, timingSafeEqual } from "crypto";
import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import {
  createUser,
  findUserByEmail,
  findUserById,
  type StoredUser,
} from "@/server/commercial/store";

const SESSION_COOKIE = "cc_session";
const BCRYPT_ROUNDS = 12;

export interface SessionUser {
  id: string;
  email: string;
  fullName: string;
  companyName?: string;
  phone?: string;
  /** ISO timestamp when verified; null = not verified. */
  emailVerifiedAt: string | null;
}

function sessionSecret(): Uint8Array {
  const raw =
    process.env.AUTH_SECRET?.trim() ||
    process.env.NEXTAUTH_SECRET?.trim() ||
    "";
  if (raw.length >= 32) {
    return new TextEncoder().encode(raw);
  }
  const demoMode =
    (process.env.DEMO_MODE ?? "").trim().toLowerCase() === "true";
  // Production requires AUTH_SECRET unless this is an explicit demo deploy.
  if (process.env.NODE_ENV === "production" && !raw && !demoMode) {
    throw new Error("AUTH_SECRET must be set in production (min 32 characters)");
  }
  return new TextEncoder().encode(
    raw || "cargo-connect-dev-auth-secret-change-me-32+",
  );
}

export function publicUser(user: StoredUser): SessionUser {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    companyName: user.companyName,
    phone: user.phone,
    emailVerifiedAt: user.emailVerifiedAt ?? null,
  };
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(
  password: string,
  passwordHash: string,
): Promise<boolean> {
  return bcrypt.compare(password, passwordHash);
}

export async function signupUser(input: {
  fullName: string;
  email: string;
  password: string;
  companyName?: string;
  phone?: string;
}): Promise<{ user: SessionUser } | { error: string }> {
  const email = input.email.trim().toLowerCase();
  const fullName = input.fullName.trim();
  if (!fullName || fullName.length < 2) return { error: "Full name is required" };
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "A valid email is required" };
  }
  if (!input.password || input.password.length < 8) {
    return { error: "Password must be at least 8 characters" };
  }

  const existing = await findUserByEmail(email);
  if (existing) return { error: "An account with this email already exists" };

  const passwordHash = await hashPassword(input.password);
  const user = await createUser({
    id: `user_${randomBytes(12).toString("hex")}`,
    email,
    passwordHash,
    fullName,
    companyName: input.companyName?.trim() || undefined,
    phone: input.phone?.trim() || undefined,
    emailVerifiedAt: null,
  });

  // Best-effort verification email — never block signup/explore
  const { issueEmailVerification } = await import(
    "@/server/commercial/emailVerification"
  );
  await issueEmailVerification(user);

  return { user: publicUser(user) };
}

export async function loginUser(input: {
  email: string;
  password: string;
}): Promise<{ user: SessionUser } | { error: string }> {
  const email = input.email.trim().toLowerCase();
  const user = await findUserByEmail(email);
  if (!user) {
    // Constant-ish work
    await hashPassword(input.password);
    return { error: "Invalid email or password" };
  }
  const ok = await verifyPassword(input.password, user.passwordHash);
  if (!ok) return { error: "Invalid email or password" };
  return { user: publicUser(user) };
}

export async function createSessionToken(userId: string): Promise<string> {
  return new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("14d")
    .sign(sessionSecret());
}

export async function readSessionUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, sessionSecret());
    const userId = typeof payload.sub === "string" ? payload.sub : null;
    if (!userId) return null;
    const user = await findUserById(userId);
    return user ? publicUser(user) : null;
  } catch {
    return null;
  }
}

export async function setSessionCookie(userId: string): Promise<void> {
  const token = await createSessionToken(userId);
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 14,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

export { SESSION_COOKIE };

/** Timing-safe string compare helper for tokens if needed later. */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}
