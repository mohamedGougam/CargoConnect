import { AuthForm } from "@/components/auth/AuthForm";

export default async function AuthPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; mode?: string }>;
}) {
  const params = await searchParams;
  const nextPath = safeNext(params.next);
  const mode = params.mode === "login" ? "login" : "signup";

  return (
    <main className="min-h-dvh overflow-y-auto bg-[radial-gradient(ellipse_at_top,#122033_0%,#071018_55%)] px-4 py-12">
      <AuthForm initialMode={mode} nextPath={nextPath} />
    </main>
  );
}

function safeNext(value?: string): string {
  if (!value) return "/";
  if (!value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}
