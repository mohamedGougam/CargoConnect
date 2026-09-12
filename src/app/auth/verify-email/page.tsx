import Link from "next/link";
import type { ReactNode } from "react";
import { consumeEmailVerificationToken } from "@/server/commercial/emailVerification";
import { VerifyEmailClient } from "@/components/auth/VerifyEmailClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const params = await searchParams;
  const token = params.token?.trim() ?? "";

  if (!token) {
    return (
      <VerifyLayout>
        <VerifyEmailClient
          initialStatus="missing"
          message="This verification link is missing a token. Request a new verification email from your account."
        />
      </VerifyLayout>
    );
  }

  const result = await consumeEmailVerificationToken(token);

  if (!result.ok) {
    return (
      <VerifyLayout>
        <VerifyEmailClient initialStatus="failed" message={result.error} />
      </VerifyLayout>
    );
  }

  return (
    <VerifyLayout>
      <VerifyEmailClient
        initialStatus="success"
        message="Your email is verified. You can now send commercial requests."
        email={result.user.email}
      />
    </VerifyLayout>
  );
}

function VerifyLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-[#071018] px-4 text-slate-100">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <Link
            href="/"
            className="font-[family-name:var(--font-fraunces)] text-lg text-white/90"
          >
            CargoConnect
          </Link>
        </div>
        {children}
      </div>
    </div>
  );
}
