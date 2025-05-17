// src/app/page.tsx
'use client';

import { useState, FormEvent } from 'react';

// --- 動画情報関連の型定義 (既存) ---
interface VideoInfo { // これは単一動画の詳細用なので、一覧表示用には調整が必要かも
  youtube_video_id: string;
  title?: string | null;
  description?: string | null;
  thumbnail_url?: string | null;
  // 必要に応じて再生回数なども追加
  viewCount?: string | null;
}

interface VideoApiResponse { // 単一動画取得APIのレスポンス
  message: string;
  data?: VideoInfo;
  error?: string;
}

// --- チャンネル情報関連の型定義 (既存) ---
interface ChannelInfo {
  channelId: string; // これは youtube_channel_id に相当
  title?: string | null;
  description?: string | null;
  publishedAt?: string | null;
  subscriberCount?: string | null;
  videoCount?: string | null;
  thumbnailUrl?: string | null;
  totalViewCount?: string | null;
}

interface ChannelApiResponse { // チャンネル情報取得APIのレスポンス
  message: string;
  data?: ChannelInfo;
  error?: string;
}

// --- チャンネルの動画リストAPIのレスポンスデータ型 (新規) ---
// API側 (/api/getChannelVideos) のレスポンスの data 配列の要素の型
interface ChannelVideoListItem {
  youtube_video_id: string;
  title?: string | null;
  thumbnail_url?: string | null;
  // 必要なら他の情報も
}

interface ChannelVideosApiResponse {
  message: string;
  data?: ChannelVideoListItem[]; // 動画リスト
  error?: string;
}


export default function HomePage() {
  // --- 動画情報関連のState (既存) ---
  const [youtubeVideoUrl, setYoutubeVideoUrl] = useState<string>('');
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null);
  const [isFetchingVideo, setIsFetchingVideo] = useState<boolean>(false);
  const [videoFetchError, setVideoFetchError] = useState<string>('');

  // --- チャンネル情報関連のState (既存) ---
  const [youtubeChannelUrl, setYoutubeChannelUrl] = useState<string>('');
  const [channelInfo, setChannelInfo] = useState<ChannelInfo | null>(null);
  const [isFetchingChannel, setIsFetchingChannel] = useState<boolean>(false);
  const [channelFetchError, setChannelFetchError] = useState<string>('');

  // --- チャンネルの動画リスト関連のState (新規) ---
  const [channelVideos, setChannelVideos] = useState<ChannelVideoListItem[] | null>(null);
  const [isFetchingChannelVideos, setIsFetchingChannelVideos] = useState<boolean>(false);
  const [channelVideosError, setChannelVideosError] = useState<string>('');


  // --- 動画情報取得処理 (既存) ---
  const handleVideoSubmit = async (event: FormEvent<HTMLFormElement>) => {
    // ... (既存のコードは変更なし) ...
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

  // --- チャンネルの動画リストを取得する関数 (新規) ---
  const fetchChannelVideos = async (youtubeChannelId: string) => {
    if (!youtubeChannelId) return;
    setIsFetchingChannelVideos(true);
    setChannelVideosError('');
    setChannelVideos(null); // 前回のをクリア
    try {
      const response = await fetch('/api/getChannelVideos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ youtubeChannelId }), // API側で受け取るキー名に合わせる
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

  // --- チャンネル情報取得処理 (動画リスト取得の呼び出しを追加) ---
  const handleChannelSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsFetchingChannel(true);
    setChannelFetchError('');
    setChannelInfo(null);
    setChannelVideos(null); // チャンネル情報取得時に動画リストもクリア
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
      // チャンネル情報取得に成功したら、そのチャンネルの動画リストも取得開始
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

  // --- (formatDate, formatCount 関数は変更なし) ---
  const formatDate = (isoDateString?: string | null) => {
    if (!isoDateString) return 'N/A';
    try {
      return new Date(isoDateString).toLocaleDateString('ja-JP', {
        year: 'numeric', month: 'long', day: 'numeric'
      });
    } catch {
      return 'Invalid Date';
    }
  };

  const formatCount = (countStr?: string | null) => {
    if (!countStr) return 'N/A';
    const count = parseInt(countStr, 10);
    if (isNaN(count)) return 'N/A';
    if (count >= 100000000) {
        return (count / 100000000).toFixed(1).replace(/\.0$/, '') + '億';
    }
    if (count >= 10000) {
        return (count / 10000).toFixed(1).replace(/\.0$/, '') + '万';
    }
    return count.toLocaleString();
  };


  return (
    <main className="min-h-screen bg-gray-100 flex flex-col items-center p-4 space-y-12">
      {/* --- 動画情報取得セクション (既存のまま) --- */}
      <section className="bg-white shadow-xl rounded-lg p-6 md:p-8 w-full max-w-2xl">
        {/* ... (既存の動画情報ゲッターUIは変更なし) ... */}
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
              className="mt-1 block w-full px-4 py-3 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm transition-shadow duration-150 ease-in-out hover:shadow-md"
            />
          </div>
          <button type="submit" disabled={isFetchingVideo}
            className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors duration-150 ease-in-out">
            {isFetchingVideo ? '動画情報を取得中...' : '動画情報を取得'}
          </button>
        </form>
        {videoFetchError && <div role="alert" className="mt-6 bg-red-50 border-l-4 border-red-400 text-red-700 p-4 rounded-md"><p className="font-bold">エラー</p><p>{videoFetchError}</p></div>}
        {videoInfo && (
          <div className="mt-8 p-6 border border-gray-200 rounded-lg bg-gray-50 shadow">
            <h2 className="text-xl md:text-2xl font-semibold text-gray-800 mb-4 break-words">{videoInfo.title || 'タイトルなし'}</h2>
            {videoInfo.thumbnail_url && <img src={videoInfo.thumbnail_url} alt={videoInfo.title || ''} className="w-full max-w-md mx-auto h-auto rounded-lg mb-4 shadow-lg"/>}
            <p className="text-xs text-gray-600 mb-1 break-all"><strong>動画ID:</strong> {videoInfo.youtube_video_id}</p>
          </div>
        )}
      </section>

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
              className="mt-1 block w-full px-4 py-3 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-sky-500 focus:border-sky-500 sm:text-sm transition-shadow duration-150 ease-in-out hover:shadow-md"
            />
          </div>
          <button type="submit" disabled={isFetchingChannel || isFetchingChannelVideos} // チャンネル情報取得中または動画リスト取得中は無効
            className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-sky-600 hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sky-500 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors duration-150 ease-in-out">
            {(isFetchingChannel || isFetchingChannelVideos) ? '情報を取得中...' : 'チャンネル情報と動画リストを取得'}
          </button>
        </form>

        {channelFetchError && (
          <div role="alert" className="mt-6 bg-red-50 border-l-4 border-red-400 text-red-700 p-4 rounded-md">
            <p className="font-bold">エラー (チャンネル情報):</p>
            <p>{channelFetchError}</p>
          </div>
        )}

        {channelInfo && (
          <div className="mt-8 p-6 border border-gray-200 rounded-lg bg-gray-50 shadow">
            {/* ... (既存のチャンネル情報表示部分は変更なし) ... */}
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
              <p><strong className="font-medium text-gray-700">チャンネル総再生回数:</strong> <span className="text-gray-600">{formatCount(channelInfo.totalViewCount)}</span></p>
              <p><strong className="font-medium text-gray-700">チャンネル開設日 (初回投稿日目安):</strong> <span className="text-gray-600">{formatDate(channelInfo.publishedAt)}</span></p>
              <p className="text-xs text-gray-500"><strong className="font-medium">チャンネルID:</strong> <span className="break-all">{channelInfo.channelId}</span></p>
            </div>

            {/* --- 動画リスト表示 (新規追加) --- */}
            {isFetchingChannelVideos && <p className="mt-6 text-center text-gray-500">動画リストを取得中...</p>}
            {channelVideosError && (
              <div role="alert" className="mt-6 bg-red-100 border-l-4 border-red-500 text-red-700 p-4 rounded-md">
                <p className="font-bold">エラー (動画リスト):</p>
                <p>{channelVideosError}</p>
              </div>
            )}
            {channelVideos && channelVideos.length > 0 && (
              <div className="mt-6 pt-6 border-t border-gray-300">
                <h3 className="text-lg font-semibold text-gray-700 mb-3">取得した動画 ({channelVideos.length}件)</h3>
                <ul className="space-y-3 max-h-96 overflow-y-auto pr-2">
                  {channelVideos.map((video) => (
                    <li key={video.youtube_video_id} className="p-3 bg-white rounded-md shadow-sm flex items-start space-x-3 hover:bg-gray-50 transition-colors">
                      {video.thumbnail_url && (
                        <img src={video.thumbnail_url} alt={video.title || ''} className="w-20 h-auto rounded object-cover flex-shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-sky-700 truncate" title={video.title || ''}>{video.title || 'タイトルなし'}</p>
                        <p className="text-xs text-gray-500">ID: {video.youtube_video_id}</p>
                        {/* 必要に応じてここに再生回数なども表示できますが、
                            ChannelVideoListItem 型定義とAPIレスポンスに含める必要があります */}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {channelVideos && channelVideos.length === 0 && !isFetchingChannelVideos && (
              <p className="mt-6 text-center text-gray-500">このチャンネルの動画は見つかりませんでした、またはまだ取得されていません。</p>
            )}
          </div>
        )}
      </section>
    </main>
  );
}