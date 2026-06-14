import { createClient } from "@supabase/supabase-js";

// Supabase Admin SDK (service_role key — acesso total ao banco)
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.warn("⚠️  Supabase admin não configurado. Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env");
}

export const supabaseAdmin = supabaseUrl && supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey)
  : null;

/**
 * Upload de arquivo para Supabase Storage.
 * Retorna a URL pública do arquivo.
 */
export async function uploadFile(
  bucket: string,
  path: string,
  file: Buffer,
  contentType: string
): Promise<string | null> {
  if (!supabaseAdmin) {
    console.error("Supabase admin não configurado");
    return null;
  }

  const { error } = await supabaseAdmin
    .storage
    .from(bucket)
    .upload(path, file, {
      contentType,
      upsert: true,
    });

  if (error) {
    console.error("Upload error:", error);
    return null;
  }

  // Retornar URL pública
  const { data: urlData } = supabaseAdmin
    .storage
    .from(bucket)
    .getPublicUrl(path);

  return urlData?.publicUrl || null;
}

/**
 * Gerar URL assinada (temporária) para download.
 */
export async function getSignedUrl(
  bucket: string,
  path: string,
  expiresIn: number = 3600 // 1 hora
): Promise<string | null> {
  if (!supabaseAdmin) {
    console.error("Supabase admin não configurado");
    return null;
  }

  const { data, error } = await supabaseAdmin
    .storage
    .from(bucket)
    .createSignedUrl(path, expiresIn);

  if (error) {
    console.error("Signed URL error:", error);
    return null;
  }

  return data?.signedUrl || null;
}

/**
 * Verificar se arquivo existe no storage.
 */
export async function fileExists(
  bucket: string,
  path: string
): Promise<boolean> {
  if (!supabaseAdmin) return false;

  const { data, error } = await supabaseAdmin
    .storage
    .from(bucket)
    .list(path.split("/").slice(0, -1).join("/") || undefined, {
      search: path.split("/").pop(),
    });

  if (error) return false;
  return (data?.length || 0) > 0;
}
