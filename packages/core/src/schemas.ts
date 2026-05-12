import { z } from 'zod'

export const PayoutRequestSchema = z.object({
  farmer_id: z.string().uuid(),
  gross_amount: z.string().regex(/^\d+(\.\d{1,4})?$/, 'must be a decimal string'),
  currency: z.string().length(3).default('INR'),
  description: z.string().optional(),
})

export type PayoutRequest = z.infer<typeof PayoutRequestSchema>

export const FarmerSchema = z.object({
  id: z.string().uuid(),
  phone: z.string().min(10).max(15),
  name: z.string().min(1).max(255),
  kyc_status: z.enum(['PENDING', 'VERIFIED', 'REJECTED']),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
})

export type Farmer = z.infer<typeof FarmerSchema>
