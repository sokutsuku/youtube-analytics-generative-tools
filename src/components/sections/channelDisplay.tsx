// src/components/ChannelDisplay.tsx
'use client';

import { useState } from 'react'; // useEffect はまだ使っていないので削除
import { motion, AnimatePresence } from 'framer-motion';

// 型定義 (page.tsxからインポートするか、共通ファイルに定義)
// これらの型定義は、このファイルの外部（例: src/types/index.ts）に定義し、
// ここや page.tsx からインポートするのが理想的です。
interface ChannelDetailsForClient {
  id: string;
  youtube_channel_id: string;
  title?: string | null;
  description?: string | null;
  published_at?: string | null;
  thumbnail_url?: string | null;
  subscriber_count?: number | null;
  video_count?: number | null;
  total_view_count?: number | null;
}
interface VideoDetailsForClient {
  id: string; // Supabaseのvideosテーブルのid (uuid)
  youtube_video_id: string;
  title?: string | null;
  thumbnail_url?: string | null;
  published_at?: string | null;
  view_count?: number | null;
  like_count?: number | null;
  comment_count?: number | null;
}
interface VideoStatLogItem {
  fetched_at: string;
  view_count?: number | null;
  like_count?: number | null;
  comment_count?: number | null;
}

interface ChannelDisplayProps {
  initialChannel: ChannelDetailsForClient;
  initialVideos: VideoDetailsForClient[];
}

// ★★★ formatDate と formatCount 関数をファイルスコープに定義（またはutilsからインポート）★★★
const formatDate = (isoDateString?: string | null): string => {
  if (!isoDateString) return 'N/A';
  try {
    return new Date(isoDateString).toLocaleDateString('ja-JP', {
      year: 'numeric', month: 'long', day: 'numeric'
    });
  } catch (_error: unknown) { // エラーオブジェクトを受け取る (使わない場合はアンダースコア)
    console.error("Error formatting date:", isoDateString, _error);
    return 'Invalid Date';
  }
};

const formatCount = (count?: string | null | number): string => {
  if (count == null) return 'N/A'; // null または undefined の場合
  const num = typeof count === 'string' ? parseInt(count, 10) : count;
  if (isNaN(num)) return 'N/A'; // parseInt が失敗した場合

  if (num >= 100000000) {
      return (num / 100000000).toFixed(1).replace(/\.0$/, '') + '億';
  }
  if (num >= 10000) {
      return (num / 10000).toFixed(1).replace(/\.0$/, '') + '万';
  }
  return num.toLocaleString();
};
// ★★★ ここまで ★★★


const AccordionItem: React.FC<{
  video: VideoDetailsForClient;
  fetchStatsLog: (supabaseVideoId: string) => Promise<VideoStatLogItem[]>;
}> = ({ video, fetchStatsLog }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [statsLog, setStatsLog] = useState<VideoStatLogItem[] | null>(null);
  const [isLoadingStats, setIsLoadingStats] = useState(false);
  const [statsError, setStatsError] = useState<string>('');

  const toggleAccordion = async () => {
    const newIsOpen = !isOpen;
    setIsOpen(newIsOpen);
    if (newIsOpen && !statsLog) {
      setIsLoadingStats(true);
      setStatsError('');
      try {
        const logData = await fetchStatsLog(video.id);
        setStatsLog(logData);
      } catch (err: unknown) { // catch のエラー型を unknown に
        if (err instanceof Error) {
          setStatsError(err.message || 'Failed to load stats history.');
        } else {
          setStatsError('An unknown error occurred while loading stats history.');
        }
      } finally {
        setIsLoadingStats(false);
      }
    }
  };

  return (
    <div className="border-b border-gray-200">
      <motion.button
        onClick={toggleAccordion}
        className="flex justify-between items-center w-full py-3 px-2 text-left hover:bg-gray-50 focus:outline-none"
      >
        <div className="flex items-center space-x-3">
          {video.thumbnail_url && <img src={video.thumbnail_url} alt={video.title || ''} className="w-20 h-12 object-cover rounded-md"/>}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-800 truncate" title={video.title || ''}>{video.title || 'タイトルなし'}</p>
            <p className="text-xs text-gray-500">
              再生: {formatCount(video.view_count)} | いいね: {formatCount(video.like_count)} | コメント: {formatCount(video.comment_count)}
            </p>
          </div>
        </div>
        <motion.div animate={{ rotate: isOpen ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-gray-500"><path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" /></svg>
        </motion.div>
      </motion.button>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.section
            key="content"
            initial="collapsed"
            animate="open"
            exit="collapsed"
            variants={{
              open: { opacity: 1, height: 'auto', marginTop: '8px', marginBottom: '8px' },
              collapsed: { opacity: 0, height: 0, marginTop: '0px', marginBottom: '0px' },
            }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="px-2 pb-3 text-sm"
          >
            {isLoadingStats && <p className="text-gray-500">統計履歴を読み込み中...</p>}
            {statsError && <p className="text-red-500">{statsError}</p>}
            {statsLog && statsLog.length > 0 && (
              <div className="mt-2 space-y-1 max-h-60 overflow-y-auto border p-2 rounded-md bg-gray-50">
                <p className="font-semibold text-xs text-gray-700">再生数・いいね・コメント数の変遷:</p>
                {statsLog.map((log, index) => (
                  <div key={index} className="text-xs text-gray-600 border-b last:border-b-0 py-1">
                    <span className="font-medium">{formatDate(log.fetched_at)}:</span> 再: {formatCount(log.view_count)}, 👍: {formatCount(log.like_count)}, 💬: {formatCount(log.comment_count)}
                  </div>
                ))}
              </div>
            )}
            {statsLog && statsLog.length === 0 && !isLoadingStats && <p className="text-gray-500">統計履歴はありません。</p>}
          </motion.section>
        )}
      </AnimatePresence>
    </div>
  );
};


export default function ChannelDisplay({ initialChannel, initialVideos }: ChannelDisplayProps) {
  const [channel, setChannel] = useState(initialChannel);
  const [videos, setVideos] = useState(initialVideos);

  const fetchVideoStatsLog = async (supabaseVideoId: string): Promise<VideoStatLogItem[]> => {
    const response = await fetch(`/api/getVideoStatsLog/${supabaseVideoId}`);
    if (!response.ok) {
      // エラーレスポンスがJSON形式であると仮定
      let errorDetails = 'Failed to fetch video stats log';
      try {
        const errorData = await response.json();
        errorDetails = errorData.error || errorData.message || errorDetails;
      } catch (e) {
        // JSONパースに失敗した場合
        console.error('Failed to parse error response as JSON', e);
      }
      throw new Error(errorDetails);
    }
    return response.json();
  };

  // ChannelDisplay コンポーネント内で formatDate と formatCount を再定義する必要はないので削除

  return (
    <div className="space-y-8">
      {/* チャンネル基本情報 */}
      <section className="bg-white shadow-lg rounded-lg p-6">
        <div className="flex items-center space-x-4 mb-4">
          {channel.thumbnail_url && <img src={channel.thumbnail_url} alt={channel.title || ''} className="w-24 h-24 rounded-full shadow-md"/>}
          <div>
            <h1 className="text-3xl font-bold text-gray-800">{channel.title || 'チャンネル名なし'}</h1>
            <p className="text-sm text-gray-500">チャンネルID: {channel.youtube_channel_id}</p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center mb-4">
          <div><p className="text-xs text-gray-500">登録者数</p><p className="text-xl font-semibold">{formatCount(channel.subscriber_count)}</p></div>
          <div><p className="text-xs text-gray-500">総再生回数</p><p className="text-xl font-semibold">{formatCount(channel.total_view_count)}</p></div>
          <div><p className="text-xs text-gray-500">動画本数</p><p className="text-xl font-semibold">{formatCount(channel.video_count)}</p></div>
        </div>
        {channel.description && <p className="text-sm text-gray-600 mt-2 whitespace-pre-wrap max-h-24 overflow-y-auto">{channel.description}</p>}
        {channel.published_at && <p className="text-xs text-gray-400 mt-2">開設日: {formatDate(channel.published_at)}</p>}
      </section>

      {/* 動画一覧 */}
      <section className="bg-white shadow-lg rounded-lg p-6">
        <h2 className="text-2xl font-semibold text-gray-700 mb-4">動画一覧 ({videos.length}件)</h2>
        {videos.length > 0 ? (
          <div className="space-y-1">
            {videos.map((video) => (
              <AccordionItem key={video.id} video={video} fetchStatsLog={fetchVideoStatsLog} />
            ))}
          </div>
        ) : (
          <p className="text-gray-500">このチャンネルの動画はまだありません。</p>
        )}
      </section>
    </div>
  );
}