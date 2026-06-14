#!/usr/bin/env node
/**
 * Script de monitoramento de compras pendentes.
 * Roda via cron job a cada 5 minutos.
 * 
 * Fluxo:
 * 1. Consulta banco por compras pendentes
 * 2. Se encontrar, retorna dados formatados
 * 3. Hermes Agent notifica o usuário
 * 4. Usuário confirma via Discord/Telegram
 * 5. Script de confirmação envia ebook
 * 
 * Uso: node scripts/monitor-purchases.js
 * Variáveis de ambiente necessárias:
 * - DATABASE_URL (PostgreSQL)
 * - ADMIN_API_KEY (para confirmar)
 */

const { Pool } = require("pg");

async function monitor() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
  });

  try {
    // Buscar compras pendentes
    const result = await pool.query(`
      SELECT id, email, name, amount, metadata, created_at 
      FROM purchases 
      WHERE status = 'pending' 
      ORDER BY created_at DESC 
      LIMIT 10
    `);

    if (result.rows.length === 0) {
      // Sem compras pendentes - sair silenciosamente
      process.exit(0);
    }

    // Formatar para notificação
    const purchases = result.rows.map(p => ({
      id: p.id,
      email: p.email,
      name: p.name,
      amount: p.amount,
      createdAt: p.created_at,
    }));

    console.log(JSON.stringify({
      pending: purchases,
      count: purchases.length,
      timestamp: new Date().toISOString(),
    }));
  } catch (error) {
    console.error("Monitor error:", error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

monitor();
