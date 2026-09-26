import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Check, Copy, ExternalLink, LogOut, Plus, Trash2 } from "lucide-react";
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
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: Invoice,
});

type Item = { name: string; unitPrice: string; quantity: string };
type Form = { clientName: string; email: string; items: Item[]; currency: string; notes: string };
const blankItem = (): Item => ({ name: "", unitPrice: "", quantity: "1" });
const empty = (): Form => ({ clientName: "", email: "", items: [blankItem()], currency: "USD", notes: "" });

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
    const c = f.items.reduce((s, i) => {
      const p = Number(i.unitPrice), q = Number(i.quantity);
      return Number.isFinite(p) && Number.isFinite(q) && p > 0 && q > 0 ? s + Math.round(p * 100) * Math.floor(q) : s;
    }, 0);
    return (c / 100).toFixed(2);
  }, [f.items]);

  const setField = (k: "clientName" | "email" | "currency" | "notes") => (v: string) => setF((p) => ({ ...p, [k]: v }));
  const setItem = (idx: number, k: keyof Item, v: string) =>
    setF((p) => ({ ...p, items: p.items.map((it, i) => (i === idx ? { ...it, [k]: v } : it)) }));
  const addItem = () => setF((p) => (p.items.length >= 20 ? p : { ...p, items: [...p.items, blankItem()] }));
  const removeItem = (idx: number) => setF((p) => ({ ...p, items: p.items.length > 1 ? p.items.filter((_, i) => i !== idx) : p.items }));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const parsed = invoiceSchema.safeParse(f);
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const i of parsed.error.issues) errs[i.path.join(".")] ??= i.message;
      setErrors(errs);
      toast.error("Please fix the highlighted fields.");
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
    try {
      await navigator.clipboard.writeText(result.url);
      setCopied(true);
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Couldn't copy — select the link and copy it manually.");
    }
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6 sm:py-14">
      <header className="mb-6 flex items-center justify-between gap-3 sm:mb-8">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">ZCraft Studios</p>
          <h1 className="font-display text-2xl sm:text-4xl">New invoice</h1>
        </div>
        <Button variant="ghost" size="sm" onClick={async () => { await logout(); router.navigate({ to: "/login" }); }}>
          <LogOut className="size-4" /> <span className="hidden sm:inline">Sign out</span>
        </Button>
      </header>

      <form onSubmit={onSubmit} noValidate className="space-y-6 rounded-xl border bg-card p-4 shadow-[var(--shadow-card)] sm:p-8">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field id="clientName" label="Client name" error={errors["clientName"]}>
            <Input id="clientName" value={f.clientName} onChange={(e) => setField("clientName")(e.target.value)} maxLength={100} />
          </Field>
          <Field id="email" label="Client email" error={errors["email"]}>
            <Input id="email" type="email" inputMode="email" autoComplete="off" value={f.email} onChange={(e) => setField("email")(e.target.value)} maxLength={255} />
          </Field>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>Products</Label>
            <Field id="currency" label="" error={errors["currency"]} className="w-28">
              <Select value={f.currency} onValueChange={setField("currency")}>
                <SelectTrigger id="currency" aria-label="Currency"><SelectValue /></SelectTrigger>
                <SelectContent>{CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
          </div>
          {f.items.map((it, idx) => (
            <div key={idx} className="grid grid-cols-2 gap-3 rounded-lg border p-3 sm:grid-cols-[1fr_8rem_6rem_auto] sm:items-start">
              <Field id={`name-${idx}`} label="Product name" error={errors[`items.${idx}.name`]} className="col-span-2 sm:col-span-1">
                <Input id={`name-${idx}`} value={it.name} onChange={(e) => setItem(idx, "name", e.target.value)} placeholder="Custom spawn build" maxLength={150} />
              </Field>
              <Field id={`price-${idx}`} label="Price" error={errors[`items.${idx}.unitPrice`]}>
                <Input id={`price-${idx}`} type="number" inputMode="decimal" step="0.01" min="0" value={it.unitPrice} onChange={(e) => setItem(idx, "unitPrice", e.target.value)} />
              </Field>
              <Field id={`qty-${idx}`} label="Qty" error={errors[`items.${idx}.quantity`]}>
                <Input id={`qty-${idx}`} type="number" inputMode="numeric" step="1" min="1" value={it.quantity} onChange={(e) => setItem(idx, "quantity", e.target.value)} />
              </Field>
              <div className="col-span-2 flex justify-end sm:col-span-1 sm:pt-7">
                <Button type="button" variant="ghost" size="icon" onClick={() => removeItem(idx)} disabled={f.items.length === 1} aria-label="Remove product">
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </div>
          ))}
          {errors["items"] && <p className="text-xs text-destructive">{errors["items"]}</p>}
          <Button type="button" variant="outline" size="sm" onClick={addItem} disabled={f.items.length >= 20}>
            <Plus className="size-4" /> Add product
          </Button>
        </div>

        <Field id="notes" label="Notes (optional)" error={errors["notes"]}>
          <Textarea id="notes" rows={3} value={f.notes} onChange={(e) => setField("notes")(e.target.value)} maxLength={1000} />
        </Field>
        <div className="flex flex-col gap-4 border-t pt-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">Total <span className="ml-1 font-display text-2xl text-foreground">{total} {f.currency}</span></p>
          <Button type="submit" size="lg" className="w-full sm:w-auto" disabled={busy}>{busy ? "Generating…" : "Generate payment link"}</Button>
        </div>
      </form>

      {result && (
        <section className="mt-6 space-y-3 rounded-xl border border-primary/40 bg-accent p-4 sm:p-5">
          <p className="text-sm font-medium">Link ready — {result.total} {result.currency}. Send this to your client.</p>
          <div className="flex gap-2">
            <Input readOnly value={result.url} onFocus={(e) => e.currentTarget.select()} className="min-w-0 font-mono text-xs" />
            <Button onClick={copy} aria-label="Copy link">{copied ? <Check className="size-4" /> : <Copy className="size-4" />}</Button>
            <Button variant="outline" asChild aria-label="Open link"><a href={result.url} target="_blank" rel="noreferrer"><ExternalLink className="size-4" /></a></Button>
          </div>
          <Button variant="link" className="px-0" onClick={() => { setF(empty()); setResult(null); setErrors({}); }}>Start another invoice</Button>
        </section>
      )}
    </main>
  );
}

function Field({ id, label, error, children, className }: { id: string; label: string; error?: string | undefined; children: React.ReactNode; className?: string | undefined }) {
  return (
    <div className={`space-y-2 ${className ?? ""}`}>
      {label && <Label htmlFor={id}>{label}</Label>}
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
