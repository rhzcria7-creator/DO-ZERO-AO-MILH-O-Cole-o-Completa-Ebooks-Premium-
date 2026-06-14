#!/usr/bin/env node
/**
 * Script para confirmar uma compra e enviar ebook.
 * 
 * Uso: node scripts/confirm-purchase.js <purchase_id>
 * 
 * Fluxo:
 * 1. Marca compra como "completed"
 * 2. Gera token de download
 * 3. Envia e-mail com link
 * 4. Retorna resultado
 */

const { Pool } = require("pg");
const crypto = require("crypto");

async function confirm(purchaseId) {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
  });

  try {
    // Verificar se compra existe e está pendente
    const check = await pool.query(
      "SELECT id, email, name, status FROM purchases WHERE id = $1",
      [purchaseId]
    );

    if (check.rows.length === 0) {
      console.log(JSON.stringify({ error: "Compra não encontrada" }));
      process.exit(1);
    }

    const purchase = check.rows[0];

    if (purchase.status !== "pending") {
      console.log(JSON.stringify({ error: "Compra já processada", status: purchase.status }));
      process.exit(1);
    }

    // Confirmar pagamento
    await pool.query(
      "UPDATE purchases SET status = 'completed', paid_at = NOW() WHERE id = $1",
      [purchaseId]
    );

    // Gerar token de download
    const secret = process.env.DOWNLOAD_SECRET || process.env.TOKEN_SECRET;
    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 dias

    // Salvar token no banco
    await pool.query(
      "INSERT INTO downloads (purchase_id, token, token_hash, expires_at) VALUES ($1, $2, $3, $4)",
      [purchaseId, token, tokenHash, expiresAt]
    );

    // URL de download
    const downloadUrl = `${process.env.DOWNLOAD_URL || "https://dozeroaomilhao.com"}/download/${token}`;

    console.log(JSON.stringify({
      success: true,
      purchaseId,
      email: purchase.email,
      name: purchase.name,
      downloadUrl,
      expiresAt: expiresAt.toISOString(),
    }));
  } catch (error) {
    console.error("Confirm error:", error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

const purchaseId = process.argv[2];
if (!purchaseId) {
  console.log("Uso: node scripts/confirm-purchase.js <purchase_id>");
  process.exit(1);
}

confirm(parseInt(purchaseId));
