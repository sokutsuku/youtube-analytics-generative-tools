// src/app/page.tsx
// このファイルは前回の修正のままでOK (ClientHomePageContent に props を渡していない)

import Link from 'next/link';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import ClientHomePageContent from '@/compornents/sections/ClientHomePageContent';

export interface ListedChannelInfo {
  id: string;
  youtube_channel_id: string;
  title?: string | null;
  thumbnail_url?: string | null;
}

async function getRegisteredChannels(): Promise<ListedChannelInfo[]> {
  console.log('Fetching registered channels from Supabase...');
  try {
    const { data, error } = await supabaseAdmin
      .from('channels')
      .select('id, youtube_channel_id, title, thumbnail_url')
      .eq('is_public_demo', true)
      .order('title', { ascending: true });

    if (error) {
      console.error('Error fetching registered channels:', error);
      return [];
    }
    console.log('Fetched channels:', data);
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
      <section className="bg-white shadow-xl rounded-lg p-6 md:p-8 w-full max-w-2xl">
        <h1 className="text-2xl md:text-3xl font-bold text-green-700 mb-6 text-center">
          登録済みチャンネル一覧
        </h1>
        {registeredChannels.length > 0 ? (
          <ul className="space-y-3 max-h-96 overflow-y-auto pr-2">
            {registeredChannels.map((channel) => (
              <li key={channel.id} className="border rounded-lg hover:shadow-md transition-shadow">
                <Link
                  href={`/channel/${channel.youtube_channel_id}`}
                  className="flex items-center space-x-4 p-3 group"
                >
                  {channel.thumbnail_url ? (
                    <img // ← ここも <Image> に変更推奨 (next.config.js の設定も必要)
                      src={channel.thumbnail_url}
                      alt={channel.title || 'Channel Thumbnail'}
                      className="w-14 h-14 rounded-full object-cover flex-shrink-0 border border-gray-200"
                      // Next.js <Image> を使う場合は width と height が必要になることが多い
                      // width={56} height={56} // 例
                    />
                  ) : (
                    <div className="w-14 h-14 rounded-full bg-gray-200 flex items-center justify-center text-gray-400 flex-shrink-0">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.158 0a.75.75 0 1 0-1.5 0 .75.75 0 0 0 1.5 0Z" />
                      </svg>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-base font-semibold text-green-800 group-hover:text-green-600 group-hover:underline truncate" title={channel.title || ''}>
                      {channel.title || 'タイトルなし'}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      YouTube ID: {channel.youtube_channel_id}
                    </p>
                  </div>
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6 text-gray-400 group-hover:text-green-600 transition-colors">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                  </svg>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-gray-500 text-center py-4">現在、表示できる登録済みチャンネルはありません。</p>
        )}
        <p className="mt-6 text-xs text-gray-500 text-center">
          チャンネルの詳細情報を確認したい場合は、リストの項目をクリックしてください。
        </p>
      </section>

      <ClientHomePageContent /> {/* propsなしで呼び出し */}
    </main>
  );
}