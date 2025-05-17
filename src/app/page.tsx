// src/app/page.tsx
// 'use client'; // ← この行はサーバーコンポーネントなので不要です

// ★★★ 修正: useState, FormEvent のインポートを削除 ★★★
// import { useState, FormEvent } from 'react'; 
import Link from 'next/link';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import ClientHomePageContent from '@/components/sections/ClientHomePageContent'; // クライアント側の機能はこちら

// チャンネルリスト表示用の型
export interface ListedChannelInfo {
  id: string;
  youtube_channel_id: string;
  title?: string | null;
  thumbnail_url?: string | null;
}

// サーバーコンポーネントとして登録済みチャンネルリストを取得
async function getRegisteredChannels(): Promise<ListedChannelInfo[]> {
  try {
    const { data, error } = await supabaseAdmin
      .from('channels')
      .select('id, youtube_channel_id, title, thumbnail_url')
      .eq('is_public_demo', true) // 例: デモ用に公開しているチャンネルのみ
      .order('title', { ascending: true });

    if (error) {
      console.error('Error fetching registered channels:', error);
      // 本番ではより詳細なエラーハンドリングやロギングを検討
      return []; // エラー時は空配列を返すことでページ自体は表示されるようにする
    }
    return (data as ListedChannelInfo[]) || [];
  } catch (err) {
    console.error('Exception fetching registered channels:', err);
    return [];
  }
}


export default async function HomePage() {
  const registeredChannels = await getRegisteredChannels();

  return (
    <main className="min-h-screen bg-gray-100 flex flex-col items-center p-4 space-y-12 mb-12">
      {/* --- 新しいセクション: 登録済みチャンネルリスト --- */}
      <section className="bg-white shadow-xl rounded-lg p-6 md:p-8 w-full max-w-2xl">
        <h1 className="text-2xl md:text-3xl font-bold text-green-700 mb-6 text-center">
          登録済みチャンネル一覧
        </h1>
        {registeredChannels.length > 0 ? (
          <ul className="space-y-3 max-h-96 overflow-y-auto">
            {registeredChannels.map((channel) => (
              <li key={channel.id} className="border rounded-lg p-3 hover:bg-gray-50 transition-colors">
                <Link href={`/channel/${channel.youtube_channel_id}`} className="flex items-center space-x-3 group">
                  {channel.thumbnail_url && (
                    <img
                      src={channel.thumbnail_url}
                      alt={channel.title || 'Channel Thumbnail'}
                      className="w-12 h-12 rounded-full object-cover flex-shrink-0"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-green-800 group-hover:text-green-600 truncate" title={channel.title || ''}>
                      {channel.title || 'タイトルなし'}
                    </p>
                    <p className="text-xs text-gray-500">
                      ID: {channel.youtube_channel_id}
                    </p>
                  </div>
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-gray-400 group-hover:text-green-600">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                  </svg>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-gray-500 text-center">現在、表示できる登録済みチャンネルはありません。</p>
        )}
        <p className="mt-4 text-xs text-gray-500 text-center">
          チャンネルの詳細情報を確認したい場合は、リストの項目をクリックしてください。
        </p>
      </section>

      {/* 既存の機能はクライアントコンポーネントに分離 */}
      <ClientHomePageContent />
    </main>
  );
}