import { AuthForm } from "@/components/auth/AuthForm";
import { AppearanceToggle } from "@/components/ui/AppearanceToggle";

export default async function AuthPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; mode?: string }>;
}) {
  const params = await searchParams;
  const nextPath = safeNext(params.next);
  const mode = params.mode === "login" ? "login" : "signup";

  return (
    <main
      className="min-h-dvh overflow-y-auto px-4 py-12"
      style={{
        background:
          "radial-gradient(ellipse at top, var(--cc-page-glow, #122033) 0%, var(--cc-page, #071018) 55%)",
        color: "var(--cc-page-fg, #e8eef5)",
      }}
    >
      <div className="mb-4 flex justify-end">
        <AppearanceToggle />
      </div>
      <AuthForm initialMode={mode} nextPath={nextPath} />
    </main>
  );
}

function safeNext(value?: string): string {
  if (!value) return "/";
  if (!value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}
