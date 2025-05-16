// src/app/page.tsx
'use client';

import { useState, FormEvent } from 'react';

// --- 動画情報関連の型定義 (既存) ---
interface VideoInfo {
  youtube_video_id: string;
  title?: string | null;
  description?: string | null;
  thumbnail_url?: string | null;
}

interface VideoApiResponse {
  message: string;
  data?: VideoInfo;
  error?: string;
}

// --- チャンネル情報関連の型定義 (新規) ---
interface ChannelInfo {
  channelId: string;
  title?: string | null;
  description?: string | null;
  publishedAt?: string | null; // ISO 8601形式の日付文字列
  subscriberCount?: string | null;
  videoCount?: string | null;
  thumbnailUrl?: string | null;
}

interface ChannelApiResponse {
  message: string;
  data?: ChannelInfo;
  error?: string;
}


export default function HomePage() {
  // --- 動画情報関連のState (既存) ---
  const [youtubeVideoUrl, setYoutubeVideoUrl] = useState<string>('');
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null);
  const [isFetchingVideo, setIsFetchingVideo] = useState<boolean>(false);
  const [videoFetchError, setVideoFetchError] = useState<string>('');

  // --- チャンネル情報関連のState (新規) ---
  const [youtubeChannelUrl, setYoutubeChannelUrl] = useState<string>('');
  const [channelInfo, setChannelInfo] = useState<ChannelInfo | null>(null);
  const [isFetchingChannel, setIsFetchingChannel] = useState<boolean>(false);
  const [channelFetchError, setChannelFetchError] = useState<string>('');


  // --- 動画情報取得処理 (既存) ---
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
    } catch (err: any) {
      setVideoFetchError(err.message || 'Failed to fetch video info.');
    } finally {
      setIsFetchingVideo(false);
    }
  };

  // --- チャンネル情報取得処理 (新規) ---
  const handleChannelSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsFetchingChannel(true);
    setChannelFetchError('');
    setChannelInfo(null);

    try {
      const response = await fetch('/api/getChannelInfo', { // 新しいAPIエンドポイント
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelUrl: youtubeChannelUrl }),
      });
      const result: ChannelApiResponse = await response.json();
      if (!response.ok || result.error) {
        throw new Error(result.error || `An error occurred: ${response.statusText}`);
      }
      setChannelInfo(result.data || null);
    } catch (err: any) {
      setChannelFetchError(err.message || 'Failed to fetch channel info.');
    } finally {
      setIsFetchingChannel(false);
    }
  };

  // 日付フォーマット関数 (例)
  const formatDate = (isoDateString?: string | null) => {
    if (!isoDateString) return 'N/A';
    try {
      return new Date(isoDateString).toLocaleDateString('ja-JP', {
        year: 'numeric', month: 'long', day: 'numeric'
      });
    } catch (e) {
      return 'Invalid Date';
    }
  };

  // 数値フォーマット関数 (例: 10000 -> 1万)
  const formatCount = (countStr?: string | null) => {
    if (!countStr) return 'N/A';
    const count = parseInt(countStr, 10);
    if (isNaN(count)) return 'N/A';
    if (count >= 100000000) {
        return (count / 100000000).toFixed(1) + '億';
    }
    if (count >= 10000) {
        return (count / 10000).toFixed(1) + '万';
    }
    return count.toLocaleString();
  };


  return (
    <main className="min-h-screen bg-gray-100 flex flex-col items-center p-4 space-y-12">
      {/* --- 動画情報取得セクション (既存のUIを流用・調整) --- */}
      <section className="bg-white shadow-xl rounded-lg p-6 md:p-8 w-full max-w-2xl">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-800 mb-8 text-center">
          YouTube 動画情報ゲッター
        </h1>
        <form onSubmit={handleVideoSubmit} className="space-y-6">
          {/* ... (既存の動画URL入力フォーム) ... */}
          <div>
            <label htmlFor="youtubeVideoUrl" className="block text-sm font-medium text-gray-700 mb-1">
              YouTube 動画 URL:
            </label>
            <input
              type="url" id="youtubeVideoUrl" name="youtubeVideoUrl"
              value={youtubeVideoUrl} onChange={(e) => setYoutubeVideoUrl(e.target.value)}
              placeholder="例: https://www.youtube.com/watch?v=dQw4w9WgXcQ" required
              className="mt-1 block w-full px-4 py-3 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm transition-shadow duration-150 ease-in-out hover:shadow-md"
            />
          </div>
          <button type="submit" disabled={isFetchingVideo}
            className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors duration-150 ease-in-out">
            {isFetchingVideo ? '動画情報を取得中...' : '動画情報を取得'}
          </button>
        </form>
        {videoFetchError && <div role="alert" className="mt-6 bg-red-50 border-l-4 border-red-400 text-red-700 p-4 rounded-md"><p>{videoFetchError}</p></div>}
        {videoInfo && (
          <div className="mt-8 p-6 border border-gray-200 rounded-lg bg-gray-50 shadow">
            {/* ... (既存の動画情報表示エリア) ... */}
            <h2 className="text-xl md:text-2xl font-semibold text-gray-800 mb-4 break-words">{videoInfo.title || 'タイトルなし'}</h2>
            {videoInfo.thumbnail_url && <img src={videoInfo.thumbnail_url} alt={videoInfo.title || ''} className="w-full max-w-md mx-auto h-auto rounded-lg mb-4 shadow-lg"/>}
            <p className="text-xs text-gray-600 mb-1 break-all"><strong>動画ID:</strong> {videoInfo.youtube_video_id}</p>
          </div>
        )}
      </section>

      {/* --- チャンネル情報取得セクション (新規) --- */}
      <section className="bg-white shadow-xl rounded-lg p-6 md:p-8 w-full max-w-2xl">
        <h1 className="text-2xl md:text-3xl font-bold text-sky-800 mb-8 text-center">
          YouTube チャンネル情報ゲッター
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
              className="mt-1 block w-full px-4 py-3 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-sky-500 focus:border-sky-500 sm:text-sm transition-shadow duration-150 ease-in-out hover:shadow-md"
            />
          </div>
          <button type="submit" disabled={isFetchingChannel}
            className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-sky-600 hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sky-500 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors duration-150 ease-in-out">
            {isFetchingChannel ? 'チャンネル情報を取得中...' : 'チャンネル情報を取得'}
          </button>
        </form>

        {channelFetchError && (
          <div role="alert" className="mt-6 bg-red-50 border-l-4 border-red-400 text-red-700 p-4 rounded-md">
            <p className="font-bold">エラー</p>
            <p>{channelFetchError}</p>
          </div>
        )}

        {channelInfo && (
          <div className="mt-8 p-6 border border-gray-200 rounded-lg bg-gray-50 shadow">
            <div className="flex items-center mb-4">
                {channelInfo.thumbnailUrl && (
                    <img src={channelInfo.thumbnailUrl} alt={channelInfo.title || ''} className="w-20 h-20 rounded-full mr-4 shadow-md"/>
                )}
                <h2 className="text-xl md:text-2xl font-semibold text-gray-800 break-words">
                    {channelInfo.title || 'チャンネル名なし'}
                </h2>
            </div>
            <div className="space-y-3">
              <p><strong className="font-medium text-gray-700">チャンネル概要:</strong> <span className="text-sm text-gray-600 whitespace-pre-wrap break-words block mt-1 max-h-32 overflow-y-auto border p-2 rounded-md bg-white">{channelInfo.description || 'N/A'}</span></p>
              <p><strong className="font-medium text-gray-700">チャンネル登録者数:</strong> <span className="text-gray-600">{formatCount(channelInfo.subscriberCount)}</span></p>
              <p><strong className="font-medium text-gray-700">総動画数:</strong> <span className="text-gray-600">{formatCount(channelInfo.videoCount)}</span></p>
              <p><strong className="font-medium text-gray-700">チャンネル開設日 (初回投稿日目安):</strong> <span className="text-gray-600">{formatDate(channelInfo.publishedAt)}</span></p>
              <p className="text-xs text-gray-500"><strong className="font-medium">チャンネルID:</strong> <span className="break-all">{channelInfo.channelId}</span></p>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}