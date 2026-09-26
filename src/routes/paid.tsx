import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/paid")({
  validateSearch: (s: Record<string, unknown>) => ({ cancelled: s.cancelled ? 1 : undefined }),
  head: () => ({
    meta: [
      { title: "Payment status — ZCraft Studios" },
      { name: "description", content: "ZCraft Studios payment status." },
      { property: "og:title", content: "Payment status — ZCraft Studios" },
      { property: "og:description", content: "ZCraft Studios payment status." },
    ],
  }),
  component: Paid,
});

function Paid() {
  const { cancelled } = Route.useSearch();
  return (
    <main className="grid min-h-screen place-items-center px-4 text-center">
      <div className="max-w-sm space-y-2">
        <h1 className="font-display text-3xl">{cancelled ? "Payment cancelled" : "Thank you!"}</h1>
        <p className="text-muted-foreground">
          {cancelled
            ? "No charge was made. You can reopen the payment link any time."
            : "Your payment to ZCraft Studios was received. A receipt is on its way from Tebex."}
        </p>
      </div>
    </main>
  );
}
