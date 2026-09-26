import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Check, Copy, ExternalLink, LogOut } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createPaymentLink, requireAuth, signOut } from "@/lib/app.functions";
import { CURRENCIES, invoiceSchema } from "@/lib/schema";

export const Route = createFileRoute("/")({
  beforeLoad: () => requireAuth(),
  head: () => ({
    meta: [
      { title: "New invoice — ZCraft Invoices" },
      { name: "description", content: "Create Tebex payment links for ZCraft Studios commissions." },
      { property: "og:title", content: "New invoice — ZCraft Invoices" },
      { property: "og:description", content: "Create Tebex payment links for ZCraft Studios commissions." },
    ],
  }),
  component: Invoice,
});

type Form = { clientName: string; email: string; product: string; unitPrice: string; quantity: string; currency: string; notes: string };
const empty: Form = { clientName: "", email: "", product: "", unitPrice: "", quantity: "1", currency: "USD", notes: "" };

function Invoice() {
  const router = useRouter();
  const create = useServerFn(createPaymentLink);
  const logout = useServerFn(signOut);
  const [f, setF] = useState<Form>(empty);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ url: string; total: string; currency: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const total = useMemo(() => {
    const t = Number(f.unitPrice) * Number(f.quantity);
    return Number.isFinite(t) && t > 0 ? t.toFixed(2) : "0.00";
  }, [f.unitPrice, f.quantity]);

  const set = (k: keyof Form) => (v: string) => setF((p) => ({ ...p, [k]: v }));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = invoiceSchema.safeParse(f);
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const i of parsed.error.issues) errs[String(i.path[0])] ??= i.message;
      setErrors(errs);
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      const r = await create({ data: parsed.data });
      if (r.ok) {
        setResult({ url: r.url, total: r.total, currency: r.currency });
        setCopied(false);
        toast.success("Payment link created");
      } else {
        toast.error(r.error);
        if (r.error.includes("expired")) router.navigate({ to: "/login" });
      }
    } catch {
      toast.error("Request failed. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!result) return;
    await navigator.clipboard.writeText(result.url);
    setCopied(true);
    toast.success("Copied to clipboard");
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-8 sm:py-14">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">ZCraft Studios</p>
          <h1 className="font-display text-3xl sm:text-4xl">New invoice</h1>
        </div>
        <Button variant="ghost" size="sm" onClick={async () => { await logout(); router.navigate({ to: "/login" }); }}>
          <LogOut className="size-4" /> Sign out
        </Button>
      </header>

      <form onSubmit={onSubmit} noValidate className="space-y-5 rounded-xl border bg-card p-5 shadow-[var(--shadow-card)] sm:p-8">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field id="clientName" label="Client name" error={errors["clientName"]}>
            <Input id="clientName" value={f.clientName} onChange={(e) => set("clientName")(e.target.value)} maxLength={100} />
          </Field>
          <Field id="email" label="Client email" error={errors["email"]}>
            <Input id="email" type="email" inputMode="email" value={f.email} onChange={(e) => set("email")(e.target.value)} maxLength={255} />
          </Field>
        </div>
        <Field id="product" label="Product or service" error={errors["product"]}>
          <Input id="product" value={f.product} onChange={(e) => set("product")(e.target.value)} placeholder="Custom spawn build, 3 revisions" maxLength={150} />
        </Field>
        <div className="grid grid-cols-2 gap-5 sm:grid-cols-3">
          <Field id="unitPrice" label="Unit price" error={errors["unitPrice"]}>
            <Input id="unitPrice" type="number" inputMode="decimal" step="0.01" min="0" value={f.unitPrice} onChange={(e) => set("unitPrice")(e.target.value)} />
          </Field>
          <Field id="quantity" label="Quantity" error={errors["quantity"]}>
            <Input id="quantity" type="number" inputMode="numeric" step="1" min="1" value={f.quantity} onChange={(e) => set("quantity")(e.target.value)} />
          </Field>
          <Field id="currency" label="Currency" error={errors["currency"]} className="col-span-2 sm:col-span-1">
            <Select value={f.currency} onValueChange={set("currency")}>
              <SelectTrigger id="currency"><SelectValue /></SelectTrigger>
              <SelectContent>{CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
        </div>
        <Field id="notes" label="Notes (optional)" error={errors["notes"]}>
          <Textarea id="notes" rows={3} value={f.notes} onChange={(e) => set("notes")(e.target.value)} maxLength={1000} />
        </Field>
        <div className="flex flex-col gap-4 border-t pt-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">Total <span className="ml-1 font-display text-2xl text-foreground">{total} {f.currency}</span></p>
          <Button type="submit" size="lg" disabled={busy}>{busy ? "Creating…" : "Create payment link"}</Button>
        </div>
      </form>

      {result && (
        <section className="mt-6 space-y-3 rounded-xl border border-primary/40 bg-accent p-5">
          <p className="text-sm font-medium">Link ready — {result.total} {result.currency}</p>
          <div className="flex gap-2">
            <Input readOnly value={result.url} onFocus={(e) => e.currentTarget.select()} className="font-mono text-xs" />
            <Button onClick={copy} aria-label="Copy link">{copied ? <Check className="size-4" /> : <Copy className="size-4" />}</Button>
            <Button variant="outline" asChild aria-label="Open link"><a href={result.url} target="_blank" rel="noreferrer"><ExternalLink className="size-4" /></a></Button>
          </div>
          <Button variant="link" className="px-0" onClick={() => { setF(empty); setResult(null); }}>Start another invoice</Button>
        </section>
      )}
    </main>
  );
}

function Field({ id, label, error, children, className }: { id: string; label: string; error?: string | undefined; children: React.ReactNode; className?: string | undefined }) {
  return (
    <div className={`space-y-2 ${className ?? ""}`}>
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
