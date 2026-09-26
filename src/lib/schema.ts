import { z } from "zod";

export const CURRENCIES = ["USD", "EUR", "GBP", "CAD", "AUD"] as const;

export const invoiceSchema = z.object({
  clientName: z.string().trim().min(1, "Client name is required").max(100),
  email: z.string().trim().email("Enter a valid email").max(255),
  product: z.string().trim().min(1, "Product or service is required").max(150),
  unitPrice: z.coerce.number().positive("Must be greater than 0").max(100000),
  quantity: z.coerce.number().int("Whole numbers only").min(1).max(1000),
  currency: z.enum(CURRENCIES),
  notes: z.string().trim().max(1000).optional().default(""),
});

export type InvoiceInput = z.infer<typeof invoiceSchema>;
