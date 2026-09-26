import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getAuthState, signIn } from "@/lib/app.functions";

export const Route = createFileRoute("/login")({
  beforeLoad: async () => {
    const { unlocked } = await getAuthState();
    if (unlocked) throw redirect({ to: "/" });
  },
  head: () => ({
    meta: [
      { title: "Sign in — ZCraft Invoices" },
      { name: "description", content: "Private ZCraft Studios invoicing tool." },
      { property: "og:title", content: "Sign in — ZCraft Invoices" },
      { property: "og:description", content: "Private ZCraft Studios invoicing tool." },
    ],
  }),
  component: Login,
});

function Login() {
  const router = useRouter();
  const doSignIn = useServerFn(signIn);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const password = String(new FormData(e.currentTarget).get("password") ?? "");
    try {
      const r = await doSignIn({ data: { password } });
      if (r.ok) await router.navigate({ to: "/" });
      else setError(r.error);
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center px-4">
      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-6 rounded-xl border bg-card p-8 shadow-[var(--shadow-card)]">
        <div className="space-y-2">
          <div className="grid size-10 place-items-center rounded-md bg-primary text-primary-foreground"><Lock className="size-5" /></div>
          <h1 className="font-display text-2xl">ZCraft Invoices</h1>
          <p className="text-sm text-muted-foreground">Private tool. Enter the studio password.</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input id="password" name="password" type="password" autoComplete="current-password" required autoFocus />
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <Button type="submit" className="w-full" disabled={busy}>{busy ? "Checking…" : "Sign in"}</Button>
      </form>
    </main>
  );
}
