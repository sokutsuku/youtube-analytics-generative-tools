// src/components/sections/ChannelDisplay.tsx
'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image'; // Imageコンポーネントをインポート

// 型定義
interface ChannelDetailsForClient {
  id: string; // Supabaseのchannelsテーブルのid (uuid)
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
  view_count?: number | null; // videosテーブルにキャッシュする最新統計 (オプショナル)
  like_count?: number | null;  // videosテーブルにキャッシュする最新統計 (オプショナル)
  comment_count?: number | null;// videosテーブルにキャッシュする最新統計 (オプショナル)
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

// ヘルパー関数 (共通utilsファイルに切り出すのが理想)
const formatDate = (isoDateString?: string | null): string => {
  if (!isoDateString) return 'N/A';
  try {
    return new Date(isoDateString).toLocaleDateString('ja-JP', {
      year: 'numeric', month: 'long', day: 'numeric'
    });
  } catch (_error: unknown) {
    console.error("Error formatting date:", isoDateString, _error);
    return 'Invalid Date';
  }
};

const formatCount = (count?: string | null | number): string => {
  if (count == null) return 'N/A';
  const num = typeof count === 'string' ? parseInt(count, 10) : count;
  if (isNaN(num)) return 'N/A';
  if (num >= 100000000) return (num / 100000000).toFixed(1).replace(/\.0$/, '') + '億';
  if (num >= 10000) return (num / 10000).toFixed(1).replace(/\.0$/, '') + '万';
  return num.toLocaleString();
};


const AccordionItem: React.FC<{
  video: VideoDetailsForClient;
  fetchStatsLog: (supabaseVideoId: string) => Promise<VideoStatLogItem[]>;
}> = ({ video, fetchStatsLog }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [statsLog, setStatsLog] = useState<VideoStatLogItem[] | null>(null);
  const [latestStatsInAccordion, setLatestStatsInAccordion] = useState<VideoStatLogItem | null>(null);
  const [isLoadingStats, setIsLoadingStats] = useState(false);
  const [statsError, setStatsError] = useState<string>('');

  const handleToggleAccordion = async () => {
    const newIsOpen = !isOpen;
    setIsOpen(newIsOpen);
    if (newIsOpen && !statsLog && !latestStatsInAccordion) {
      setIsLoadingStats(true);
      setStatsError('');
      try {
        const logData = await fetchStatsLog(video.id);
        setStatsLog(logData || []);
        if (logData && logData.length > 0) {
          setLatestStatsInAccordion(logData[logData.length - 1]);
        }
      } catch (err: unknown) {
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

  const initialDisplayStats = {
    view_count: video.view_count,
    like_count: video.like_count,
    comment_count: video.comment_count,
  };

  return (
    <div className="border-b border-gray-200 last:border-b-0">
      <motion.button
        onClick={handleToggleAccordion}
        className="flex justify-between items-center w-full py-3 px-2 text-left hover:bg-gray-50 focus:outline-none rounded-t-md"
        aria-expanded={isOpen}
      >
        <div className="flex items-center space-x-3 min-w-0">
          {video.thumbnail_url && (
            // ★★★ <img> を <Image> に修正 ★★★
            <div className="w-20 h-12 relative rounded-md overflow-hidden flex-shrink-0">
              <Image
                src={video.thumbnail_url}
                alt={video.title || 'Video thumbnail'}
                layout="fill"
                objectFit="cover"
                // priority={false} // リスト内なので通常はfalseで良い
              />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-800 truncate" title={video.title || ''}>{video.title || 'タイトルなし'}</p>
            <p className="text-xs text-gray-500">
              再生: {formatCount(initialDisplayStats.view_count)} | いいね: {formatCount(initialDisplayStats.like_count)} | コメント: {formatCount(initialDisplayStats.comment_count)}
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
              open: { opacity: 1, height: 'auto', marginTop: '8px', marginBottom: '16px' },
              collapsed: { opacity: 0, height: 0, marginTop: '0px', marginBottom: '0px' },
            }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="px-3 pb-3 text-sm"
          >
            {isLoadingStats && <p className="text-gray-500 py-2">統計履歴を読み込み中...</p>}
            {statsError && <p className="text-red-500 py-2">{statsError}</p>}
            {latestStatsInAccordion && !isLoadingStats && !statsError && (
                 <p className="text-xs text-gray-700 font-semibold mb-2 py-1 border-b">
                    最新ログ: 再: {formatCount(latestStatsInAccordion.view_count)}, 👍: {formatCount(latestStatsInAccordion.like_count)}, 💬: {formatCount(latestStatsInAccordion.comment_count)} ({formatDate(latestStatsInAccordion.fetched_at)})
                 </p>
            )}
            {statsLog && statsLog.length > 0 && (
              <div className="mt-2 space-y-1 max-h-60 overflow-y-auto border p-2 rounded-md bg-gray-50">
                <p className="font-semibold text-xs text-gray-700 mb-1">変遷履歴 (新しい順):</p>
                {statsLog.slice().reverse().map((log, index) => (
                  <div key={index} className="text-xs text-gray-600 border-b last:border-b-0 py-1 flex justify-between flex-wrap"> {/* flex-wrap を追加 */}
                    <span className="font-medium mr-2">{formatDate(log.fetched_at)}:</span>
                    <span className="mr-2">再: {formatCount(log.view_count)}</span>
                    <span className="mr-2">👍: {formatCount(log.like_count)}</span>
                    <span>💬: {formatCount(log.comment_count)}</span>
                  </div>
                ))}
              </div>
            )}
            {statsLog && statsLog.length === 0 && !isLoadingStats && !statsError &&(
                <p className="text-gray-500 py-2">統計履歴はありません。</p>
            )}
          </motion.section>
        )}
      </AnimatePresence>
    </div>
  );
};


export default function ChannelDisplay({ initialChannel, initialVideos }: ChannelDisplayProps) {
  // ★★★ propsを直接利用するため、useStateとセッターは削除 ★★★
  const channel = initialChannel;
  const videos = initialVideos;

  const fetchVideoStatsLog = async (supabaseVideoId: string): Promise<VideoStatLogItem[]> => {
    const response = await fetch(`/api/getVideoStatsLog/${supabaseVideoId}`);
    if (!response.ok) {
      let errorDetails = 'Failed to fetch video stats log';
      try {
        const errorData = await response.json();
        errorDetails = errorData.error || errorData.message || errorDetails;
      } catch (e) {
        console.error('Failed to parse error response as JSON while fetching video stats log:', e);
      }
      throw new Error(errorDetails);
    }
    const data = await response.json();
    return (data as VideoStatLogItem[]) || [];
  };

  return (
    <div className="space-y-10">
      {/* チャンネル基本情報 */}
      <section className="bg-white shadow-xl rounded-lg p-6">
        <div className="flex flex-col sm:flex-row items-center space-y-4 sm:space-y-0 sm:space-x-6 mb-6">
          {channel.thumbnail_url && (
            // ★★★ <img> を <Image> に修正 ★★★
            <div className="w-28 h-28 relative rounded-full shadow-lg overflow-hidden flex-shrink-0">
              <Image
                src={channel.thumbnail_url}
                alt={channel.title || 'Channel thumbnail'}
                layout="fill"
                objectFit="cover"
                priority // ページの主要な画像なのでtrue
              />
            </div>
          )}
          <div className="text-center sm:text-left">
            <h1 className="text-3xl lg:text-4xl font-bold text-gray-800">{channel.title || 'チャンネル名なし'}</h1>
            <p className="text-sm text-gray-500 mt-1">YouTube Channel ID: {channel.youtube_channel_id}</p>
            {channel.published_at && <p className="text-xs text-gray-400 mt-1">開設日: {formatDate(channel.published_at)}</p>}
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-center mb-4 py-4 border-y">
          <div><p className="text-sm text-gray-500 uppercase tracking-wider">登録者数</p><p className="text-2xl font-semibold text-gray-700">{formatCount(channel.subscriber_count)}</p></div>
          <div><p className="text-sm text-gray-500 uppercase tracking-wider">総再生回数</p><p className="text-2xl font-semibold text-gray-700">{formatCount(channel.total_view_count)}</p></div>
          <div><p className="text-sm text-gray-500 uppercase tracking-wider">動画本数</p><p className="text-2xl font-semibold text-gray-700">{formatCount(channel.video_count)}</p></div>
        </div>
        {channel.description && (
            <details className="text-sm text-gray-600 mt-3">
                <summary className="cursor-pointer font-medium text-gray-700 hover:underline">概要を見る</summary>
                <p className="mt-1 whitespace-pre-wrap prose prose-sm max-w-none">{channel.description}</p>
            </details>
        )}
      </section>

      {/* 動画一覧 */}
      <section className="bg-white shadow-xl rounded-lg p-6">
        <h2 className="text-2xl font-semibold text-gray-700 mb-6">動画一覧 ({videos.length > 0 ? `${videos.length}件` : 'なし'})</h2>
        {videos.length > 0 ? (
          <div className="divide-y divide-gray-200">
            {videos.map((video) => (
              <AccordionItem key={video.id} video={video} fetchStatsLog={fetchVideoStatsLog} />
            ))}
          </div>
        ) : (
          <p className="text-gray-500 py-4 text-center">このチャンネルの動画はまだありません。</p>
        )}
      </section>
    </div>
  );
}