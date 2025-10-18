// src/app/api/auth/[...nextauth]/route.ts

import { handlers } from "@/auth"; // A single, clean import
export const { GET, POST } = handlers;
