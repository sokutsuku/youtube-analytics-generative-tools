// src/components/sections/ClientHomePageContent.tsx
'use client';

import { useState, FormEvent } from 'react';
// import { useRouter } from 'next/navigation'; // 現在このコンポーネント内では未使用

// --- 型定義 (共通化推奨) ---
interface VideoInfo {
  youtube_video_id: string;
  title?: string | null;
  description?: string | null;
  thumbnail_url?: string | null;
  viewCount?: string | null;
  likeCount?: string | null;
  commentCount?: string | null;
  publishedAt?: string | null;
}

interface VideoApiResponse {
  message: string;
  data?: VideoInfo;
  error?: string;
}

interface ChannelInfo {
  channelId: string; // youtube_channel_id
  title?: string | null;
  description?: string | null;
  publishedAt?: string | null; // この日付を表示するために formatDate が必要
  subscriberCount?: string | null;
  videoCount?: string | null;
  thumbnailUrl?: string | null;
  totalViewCount?: string | null;
  uploadsPlaylistId?: string | null;
}

interface ChannelApiResponse {
  message: string;
  data?: ChannelInfo;
  error?: string;
}

interface ChannelVideoListItem {
  youtube_video_id: string;
  title?: string | null;
  thumbnail_url?: string | null;
  view_count?: string | null;
  like_count?: string | null;
  comment_count?: string | null;
}

interface ChannelVideosApiResponse {
  message: string;
  data?: ChannelVideoListItem[];
  error?: string;
}

// ★★★ formatDate 関数をここに再定義 ★★★
const formatDate = (isoDateString?: string | null): string => {
  if (!isoDateString) return 'N/A';
  try {
    return new Date(isoDateString).toLocaleDateString('ja-JP', {
      year: 'numeric', month: 'long', day: 'numeric'
    });
  } catch (_error: unknown) { // エラーオブジェクトを受け取る (使わない場合はアンダースコア)
    console.error("Error formatting date:", isoDateString, _error); // エラーログを追加
    return 'Invalid Date';
  }
};

// 数値フォーマット関数
const formatCount = (count?: string | null | number): string => {
  if (count == null) return 'N/A';
  const num = typeof count === 'string' ? parseInt(count, 10) : count;
  if (isNaN(num)) return 'N/A';
  if (num >= 100000000) return (num / 100000000).toFixed(1).replace(/\.0$/, '') + '億';
  if (num >= 10000) return (num / 10000).toFixed(1).replace(/\.0$/, '') + '万';
  return num.toLocaleString();
};

export default function ClientHomePageContent() {
  // const router = useRouter(); // 現在未使用

  // --- 動画情報取得セクションのState ---
  const [youtubeVideoUrl, setYoutubeVideoUrl] = useState<string>('');
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null);
  const [isFetchingVideo, setIsFetchingVideo] = useState<boolean>(false);
  const [videoFetchError, setVideoFetchError] = useState<string>('');

  // --- チャンネル情報 & 動画リスト取得セクションのState ---
  const [youtubeChannelUrl, setYoutubeChannelUrl] = useState<string>('');
  const [channelInfo, setChannelInfo] = useState<ChannelInfo | null>(null);
  const [isFetchingChannel, setIsFetchingChannel] = useState<boolean>(false);
  const [channelFetchError, setChannelFetchError] = useState<string>('');

  const [channelVideos, setChannelVideos] = useState<ChannelVideoListItem[] | null>(null);
  const [isFetchingChannelVideos, setIsFetchingChannelVideos] = useState<boolean>(false);
  const [channelVideosError, setChannelVideosError] = useState<string>('');

  // --- 動画情報取得処理 ---
  const handleVideoSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsFetchingVideo(true);
    setVideoFetchError('');
    setVideoInfo(null);
    try {
      const response = await fetch('/api/getVideoInfo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ youtubeUrl: youtubeVideoUrl }),
      });
      const result: VideoApiResponse = await response.json();
      if (!response.ok || result.error) {
        throw new Error(result.error || `An error occurred: ${response.statusText}`);
      }
      setVideoInfo(result.data || null);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setVideoFetchError(err.message || 'Failed to fetch video info.');
      } else {
        setVideoFetchError('An unknown error occurred while fetching video info.');
      }
    } finally {
      setIsFetchingVideo(false);
    }
  };

  // --- チャンネルの動画リストを取得する関数 ---
  const fetchChannelVideos = async (youtubeChannelId: string) => {
    if (!youtubeChannelId) return;
    setIsFetchingChannelVideos(true);
    setChannelVideosError('');
    setChannelVideos(null);
    try {
      const response = await fetch('/api/getChannelVideos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ youtubeChannelId }),
      });
      const result: ChannelVideosApiResponse = await response.json();
      if (!response.ok || result.error) {
        throw new Error(result.error || 'Failed to fetch channel videos');
      }
      setChannelVideos(result.data || []);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setChannelVideosError(err.message || 'An unknown error occurred while fetching channel videos.');
      } else {
        setChannelVideosError('An unknown error occurred while fetching channel videos.');
      }
    } finally {
      setIsFetchingChannelVideos(false);
    }
  };

  // --- チャンネル情報取得処理 (動画リスト取得の呼び出しも含む) ---
  const handleChannelSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsFetchingChannel(true);
    setChannelFetchError('');
    setChannelInfo(null);
    setChannelVideos(null);
    setChannelVideosError('');
    try {
      const response = await fetch('/api/getChannelInfo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelUrl: youtubeChannelUrl }),
      });
      const result: ChannelApiResponse = await response.json();
      if (!response.ok || result.error) {
        throw new Error(result.error || `An error occurred: ${response.statusText}`);
      }
      setChannelInfo(result.data || null);
      if (result.data?.channelId) {
        await fetchChannelVideos(result.data.channelId);
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        setChannelFetchError(err.message || 'Failed to fetch channel info.');
      } else {
        setChannelFetchError('An unknown error occurred while fetching channel info.');
      }
    } finally {
      setIsFetchingChannel(false);
    }
  };

  return (
    <>
      {/* --- チャンネル情報 & 動画リスト取得セクション --- */}
      <section className="bg-white shadow-xl rounded-lg p-6 md:p-8 w-full max-w-2xl">
        <h1 className="text-2xl md:text-3xl font-bold text-sky-800 mb-8 text-center">
          YouTube チャンネル情報 & 動画リストゲッター
        </h1>
        <form onSubmit={handleChannelSubmit} className="space-y-6">
          <div>
            <label htmlFor="youtubeChannelUrl" className="block text-sm font-medium text-gray-700 mb-1">
              YouTube チャンネル URL:
            </label>
            <input
              type="url" id="youtubeChannelUrl" name="youtubeChannelUrl"
              value={youtubeChannelUrl} onChange={(e) => setYoutubeChannelUrl(e.target.value)}
              placeholder="例: www.youtube.com0/@YourFavoriteChannel" required
              className="mt-1 block w-full px-4 py-3 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-sky-500 focus:border-sky-500 sm:text-sm transition-shadow"
            />
          </div>
          <button type="submit" disabled={isFetchingChannel || isFetchingChannelVideos}
            className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-sky-600 hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sky-500 disabled:bg-gray-400">
            {(isFetchingChannel || isFetchingChannelVideos) ? '情報を取得中...' : 'チャンネル情報と動画リストを取得'}
          </button>
        </form>
        {channelFetchError && (
          <div role="alert" className="mt-6 bg-red-50 border-l-4 border-red-400 text-red-700 p-4 rounded-md">
            <p className="font-bold">エラー (チャンネル情報):</p><p>{channelFetchError}</p>
          </div>
        )}
        {channelInfo && (
          <div className="mt-8 p-4 border border-gray-200 rounded-lg bg-gray-50">
            <h2 className="text-xl font-semibold mb-2">{channelInfo.title || 'チャンネル名なし'}</h2>
            <p className="text-sm">ID: {channelInfo.channelId}</p>
            <p className="text-sm">概要: {channelInfo.description || 'N/A'}</p>
            <p className="text-sm">開設日: {channelInfo.publishedAt ? formatDate(channelInfo.publishedAt) : 'N/A'}</p> {/* formatDate を使用 */}
            <p className="text-sm">登録者数: {formatCount(channelInfo.subscriberCount)}</p>
            <p className="text-sm">動画数: {formatCount(channelInfo.videoCount)}</p>
            <p className="text-sm">総再生回数: {formatCount(channelInfo.totalViewCount)}</p>
            <p className="text-sm">Uploads Playlist ID: {channelInfo.uploadsPlaylistId || 'N/A'}</p>
          </div>
        )}
        {isFetchingChannelVideos && <p className="mt-4 text-center text-gray-500">動画リストを取得中...</p>}
        {channelVideosError && (
          <div role="alert" className="mt-4 bg-red-100 border-l-4 border-red-500 text-red-700 p-3">
            <p className="font-bold">エラー (動画リスト):</p><p>{channelVideosError}</p>
          </div>
        )}
        {channelVideos && channelVideos.length > 0 && (
          <div className="mt-4">
            <h3 className="text-lg font-medium text-gray-700 mb-2">動画リスト ({channelVideos.length}件):</h3>
            <ul className="space-y-2 max-h-80 overflow-y-auto pr-2">
              {channelVideos.map(video => (
                <li key={video.youtube_video_id} className="p-2 border rounded-md bg-white flex items-center space-x-2 hover:bg-gray-100 transition-colors">
                  {video.thumbnail_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={video.thumbnail_url} alt={video.title || 'Video Thumbnail'} className="w-20 h-auto object-cover rounded flex-shrink-0"/>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-800 truncate" title={video.title || ''}>{video.title || 'タイトルなし'}</p>
                    <p className="text-xs text-gray-500">ID: {video.youtube_video_id}</p>
                    <p className="text-xs text-gray-500">
                      再生: {formatCount(video.view_count)} | いいね: {formatCount(video.like_count)} | コメント: {formatCount(video.comment_count)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
        {channelVideos && channelVideos.length === 0 && !isFetchingChannelVideos && (
            <p className="mt-4 text-gray-500">このチャンネルの動画は見つかりませんでした。</p>
        )}
      </section>

      {/* --- 動画情報取得セクション --- */}
      <section className="bg-white shadow-xl rounded-lg p-6 md:p-8 w-full max-w-2xl mt-12">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-800 mb-8 text-center">
          YouTube 動画情報ゲッター
        </h1>
        <form onSubmit={handleVideoSubmit} className="space-y-6">
          <div>
            <label htmlFor="youtubeVideoUrl" className="block text-sm font-medium text-gray-700 mb-1">
              YouTube 動画 URL:
            </label>
            <input
              type="url" id="youtubeVideoUrl" name="youtubeVideoUrl"
              value={youtubeVideoUrl} onChange={(e) => setYoutubeVideoUrl(e.target.value)}
              placeholder="例: https://www.youtube.com/watch?v=dQw4w9WgXcQ" required
              className="mt-1 block w-full px-4 py-3 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm transition-shadow"
            />
          </div>
          <button type="submit" disabled={isFetchingVideo}
            className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-gray-400">
            {isFetchingVideo ? '動画情報を取得中...' : '動画情報を取得'}
          </button>
        </form>
        {videoFetchError && <div role="alert" className="mt-6 bg-red-50 border-l-4 border-red-400 text-red-700 p-4 rounded-md"><p className="font-bold">エラー</p><p>{videoFetchError}</p></div>}
        {videoInfo && (
          <div className="mt-8 p-4 border border-gray-200 rounded-lg bg-gray-50">
            <h2 className="text-xl font-semibold mb-2">{videoInfo.title || 'タイトルなし'}</h2>
            {videoInfo.thumbnail_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={videoInfo.thumbnail_url} alt={videoInfo.title || 'Video Thumbnail'} className="w-full max-w-md mx-auto h-auto rounded-lg mb-3"/>
            )}
            <p className="text-xs text-gray-600">動画ID: {videoInfo.youtube_video_id}</p>
            {/* videoInfo.publishedAt を表示する場合、formatDate(videoInfo.publishedAt) とします */}
          </div>
        )}
      </section>
    </>
  );
}