import crypto from "crypto";
import { config } from "../config/env.js";
import { logger } from "../server.js";

/**
 * Serviço de pagamento via Pix estático.
 * Fluxo simplificado (sem Mercado Pago):
 * 1. Usuário vê QR Code no checkout
 * 2. Paga via Pix
 * 3. Clica "Já paguei" → envia e-mail
 * 4. Sistema cria purchase pendente
 * 5. Owner confirma no admin
 * 6. Sistema envia ebook automaticamente
 */

export interface PendingPurchase {
  id: number;
  email: string;
  name: string;
  status: "pending" | "confirmed" | "rejected";
  createdAt: Date;
}

/**
 * Valida se um e-mail é válido (básico).
 */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Gera um código de confirmação curto para o admin.
 */
export function generateConfirmationCode(): string {
  return crypto.randomBytes(3).toString("hex").toUpperCase();
}
