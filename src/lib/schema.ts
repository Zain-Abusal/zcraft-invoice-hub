import { z } from "zod";

export const CURRENCIES = ["USD", "EUR", "GBP", "CAD", "AUD"] as const;

export const itemSchema = z.object({
  name: z.string().trim().min(1, "Product name is required").max(150),
  unitPrice: z.coerce
    .number({ invalid_type_error: "Enter a price" })
    .positive("Must be greater than 0")
    .max(100000)
    .refine((n) => Math.round(n * 100) === Number((n * 100).toFixed(6)), "Max 2 decimals"),
  quantity: z.coerce.number().int("Whole numbers only").min(1, "At least 1").max(1000),
});

export const invoiceSchema = z.object({
  clientName: z.string().trim().min(1, "Client name is required").max(100),
  email: z.string().trim().email("Enter a valid email").max(255),
  items: z.array(itemSchema).min(1, "Add at least one product").max(20, "Max 20 products"),
  currency: z.enum(CURRENCIES),
  notes: z.string().trim().max(1000).optional().default(""),
});

export type InvoiceInput = z.infer<typeof invoiceSchema>;

export function totalCents(items: { unitPrice: number; quantity: number }[]) {
  return items.reduce((s, i) => s + Math.round(i.unitPrice * 100) * i.quantity, 0);
}
