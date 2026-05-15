import { z } from 'zod'

const EnvSchema = z.object({
  VITE_API_BASE_URL: z.string().default(''),
  VITE_PUBLIC_BUILD_SHA: z.string().default('dev'),
})

export const env = EnvSchema.parse({
  VITE_API_BASE_URL: import.meta.env.VITE_API_BASE_URL,
  VITE_PUBLIC_BUILD_SHA: import.meta.env.VITE_PUBLIC_BUILD_SHA,
})

export type Env = z.infer<typeof EnvSchema>
