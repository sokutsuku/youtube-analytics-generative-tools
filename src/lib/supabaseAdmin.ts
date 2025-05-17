// src/lib/supabaseAdmin.ts
import { createClient } from '@supabase/supabase-js';

// SupabaseプロジェクトのURLとサービスロールキーを環境変数から取得
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// 環境変数が設定されているかチェック (サーバー起動時にエラーで気づけるように)
if (!supabaseUrl) {
  throw new Error("Supabase URL not found. Did you forget to set NEXT_PUBLIC_SUPABASE_URL in your .env.local or Vercel environment variables?");
}
if (!supabaseServiceRoleKey) {
  throw new Error("Supabase Service Role Key not found. Did you forget to set SUPABASE_SERVICE_ROLE_KEY in your .env.local or Vercel environment variables?");
}

// Supabaseクライアントを作成 (サービスロールキーを使用)
// このクライアントはRLSをバイパスするため、サーバーサイドでのみ使用してください。
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    // autoRefreshToken と persistSession はサーバーサイドクライアントでは通常falseに設定します。
    // 特にサービスロールキーを使う場合は、ユーザーセッションとは独立して動作するため。
    autoRefreshToken: false,
    persistSession: false,
    // detectSessionInUrl: false, // サーバーサイドでは不要
  }
});

// 注意: この supabaseAdmin インスタンスは、Row Level Security (RLS) をバイパスします。
// 必ずサーバーサイドの信頼できる環境でのみ使用し、クライアントサイドにこのキーやインスタンスが
// 漏洩しないように細心の注意を払ってください。