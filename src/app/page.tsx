// src/app/page.tsx
import Link from 'next/link'; // Linkコンポーネントはチャンネル詳細ページへの遷移がなければ不要になる
import Image from 'next/image';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import ClientChannelRegistrationForm from '@/components/sections/ClientChannelRegistrationForm'; // 新しいクライアントコンポーネント名 (例)

// チャンネルリスト表示用の型
export interface ListedChannelInfo {
  id: string; // Supabaseのchannelsテーブルのid (uuid)
  youtube_channel_id: string;
  title?: string | null;
  thumbnail_url?: string | null;
  // 必要であれば subscriber_count なども表示用に取得
  subscriber_count?: number | null;
}

// サーバーコンポーネントとして登録済みチャンネルリストを取得
async function getRegisteredChannels(): Promise<ListedChannelInfo[]> {
  console.log('Fetching registered channels from Supabase for HomePage...');
  try {
    const { data, error } = await supabaseAdmin
      .from('channels')
      .select('id, youtube_channel_id, title, thumbnail_url, subscriber_count') // subscriber_countも取得例
      // .eq('is_public_demo', true) // 必要に応じてフィルタリング
      .order('title', { ascending: true });

    if (error) {
      console.error('Error fetching registered channels for HomePage:', error);
      return [];
    }
    console.log(`Workspaceed ${data?.length || 0} channels for HomePage.`);
    return (data as ListedChannelInfo[]) || [];
  } catch (err) {
    console.error('Exception fetching registered channels for HomePage:', err);
    return [];
  }
}

export default async function HomePage() {
  const registeredChannels = await getRegisteredChannels();

  return (
    <main className="min-h-screen bg-gray-50 flex flex-col items-center p-4 md:p-8 space-y-10 mb-12">
      {/* --- セクション1: 新しいチャンネルを登録するフォーム --- */}
      {/* この機能はクライアントコンポーネントに分離 */}
      <ClientChannelRegistrationForm />

      {/* --- セクション2: 登録済みチャンネル一覧 --- */}
      <section className="bg-white shadow-xl rounded-lg p-6 md:p-8 w-full max-w-4xl"> {/* max-w を少し広げる */}
        <h1 className="text-2xl md:text-3xl font-bold text-gray-800 mb-6 text-center">
          登録済みチャンネル一覧
        </h1>
        {registeredChannels.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6"> {/* グリッド表示 */}
            {registeredChannels.map((channel) => (
              // ★★★ チャンネル詳細ページへのLinkは一旦コメントアウト (または削除) ★★★
              // <Link
              //   href={`/channel/${channel.youtube_channel_id}`} // 詳細ページがなければこのリンクは機能しない
              //   key={channel.id}
              //   className="block border rounded-lg p-4 hover:shadow-lg transition-shadow group bg-white"
              // >
              <div key={channel.id} className="border rounded-lg p-4 bg-white flex flex-col items-center text-center shadow hover:shadow-md transition-shadow">
                {channel.thumbnail_url ? (
                  <div className="w-20 h-20 relative rounded-full overflow-hidden mb-3 border-2 border-gray-200">
                    <Image
                      src={channel.thumbnail_url}
                      alt={channel.title || 'Channel Thumbnail'}
                      layout="fill"
                      objectFit="cover"
                    />
                  </div>
                ) : (
                  <div className="w-20 h-20 rounded-full bg-gray-200 flex items-center justify-center text-gray-400 mb-3 border-2 border-gray-200">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-10 h-10">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.158 0a.75.75 0 1 0-1.5 0 .75.75 0 0 0 1.5 0Z" />
                    </svg>
                  </div>
                )}
                <p className="text-sm font-semibold text-gray-700 group-hover:text-sky-600 truncate w-full" title={channel.title || ''}>
                  {channel.title || 'タイトルなし'}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  ID: {channel.youtube_channel_id}
                </p>
                {channel.subscriber_count != null && ( // 登録者数も表示する例
                    <p className="text-xs text-gray-500 mt-1">
                        登録者: {formatCount(channel.subscriber_count)} 
                        {/* formatCountはClientChannelRegistrationForm.tsxから移動または共通化が必要 */}
                    </p>
                )}
              </div>
              // </Link> // 詳細ページがなければLinkは不要
            ))}
          </div>
        ) : (
          <p className="text-gray-500 text-center py-4">現在、表示できる登録済みチャンネルはありません。</p>
        )}
      </section>

      {/* 「YouTube 動画情報ゲッター」セクションは削除 */}
    </main>
  );
}

// ★★★ formatCount関数をここに移動またはutilsからインポート ★★★
// このファイルはサーバーコンポーネントなので、クライアントサイドのロジック(useStateなど)を持つ
// ClientChannelRegistrationForm とは別にヘルパー関数を置くか、
// サーバーサイドでも使えるutilsファイルに置くのが良い。
const formatCount = (count?: string | null | number): string => {
    if (count == null) return 'N/A';
    const num = typeof count === 'string' ? parseInt(count, 10) : count;
    if (isNaN(num)) return 'N/A';
    if (num >= 100000000) return (num / 100000000).toFixed(1).replace(/\.0$/, '') + '億';
    if (num >= 10000) return (num / 10000).toFixed(1).replace(/\.0$/, '') + '万';
    return num.toLocaleString();
};