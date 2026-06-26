// Centralized API base URL
// In production (Vercel), set NEXT_PUBLIC_API_URL to your Railway backend URL.
// In development, defaults to localhost:3001.
export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
