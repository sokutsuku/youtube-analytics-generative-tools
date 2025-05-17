// src/components/sections/ClientHomePageContent.tsx
'use client';

import { useState, FormEvent } from 'react';
// import { useRouter } from 'next/navigation'; // 不要なら削除

// --- 型定義 ---
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
  channelId: string;
  title?: string | null;
  description?: string | null;
  publishedAt?: string | null;
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

const formatCount = (count?: string | null | number): string => {
  if (count == null) return 'N/A';
  const num = typeof count === 'string' ? parseInt(count, 10) : count;
  if (isNaN(num)) return 'N/A';
  if (num >= 100000000) return (num / 100000000).toFixed(1).replace(/\.0$/, '') + '億';
  if (num >= 10000) return (num / 10000).toFixed(1).replace(/\.0$/, '') + '万';
  return num.toLocaleString();
};

// ★★★ props を受け取らないように変更 ★★★
export default function ClientHomePageContent() {
  // const router = useRouter(); // 不要なら削除

  const [youtubeVideoUrl, setYoutubeVideoUrl] = useState<string>('');
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null);
  const [isFetchingVideo, setIsFetchingVideo] = useState<boolean>(false);
  const [videoFetchError, setVideoFetchError] = useState<string>('');

  const [youtubeChannelUrl, setYoutubeChannelUrl] = useState<string>('');
  const [channelInfo, setChannelInfo] = useState<ChannelInfo | null>(null);
  const [isFetchingChannel, setIsFetchingChannel] = useState<boolean>(false);
  const [channelFetchError, setChannelFetchError] = useState<string>('');

  const [channelVideos, setChannelVideos] = useState<ChannelVideoListItem[] | null>(null);
  const [isFetchingChannelVideos, setIsFetchingChannelVideos] = useState<boolean>(false);
  const [channelVideosError, setChannelVideosError] = useState<string>('');

  // ... (handleVideoSubmit, fetchChannelVideos, handleChannelSubmit は変更なし) ...
  const handleVideoSubmit = async (event: FormEvent<HTMLFormElement>) => { /* ... */ };
  const fetchChannelVideos = async (youtubeChannelId: string) => { /* ... */ };
  const handleChannelSubmit = async (event: FormEvent<HTMLFormElement>) => { /* ... */ };


  return (
    <>
      {/* --- チャンネル情報 & 動画リスト取得セクション --- */}
      <section className="bg-white shadow-xl rounded-lg p-6 md:p-8 w-full max-w-2xl">
        {/* ... (このセクションのJSXは変更なし) ... */}
      </section>

      {/* --- 動画情報取得セクション --- */}
      <section className="bg-white shadow-xl rounded-lg p-6 md:p-8 w-full max-w-2xl mt-12"> {/* mt-12 を追加して少し間隔をあける */}
        {/* ... (このセクションのJSXは変更なし) ... */}
      </section>
    </>
  );
}