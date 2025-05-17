// src/app/channel/[youtubeChannelId]/page.tsx
import ChannelDisplay from '@/components/sections/channelDisplay'; // 後で作成するクライアントコンポーネント
import { supabaseAdmin } from '@/lib/supabaseAdmin'; // サーバーサイドでのみ使用

// フロントエンドに返すチャンネル情報の型 (APIルートと共通化も可能)
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
// フロントエンドに返す動画情報の型 (APIルートと共通化も可能)
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

interface PageProps {
  params: {
    youtubeChannelId: string;
  };
}

async function getChannelPageData(youtubeChannelId: string): Promise<{
  channel: ChannelDetailsForClient | null;
  videos: VideoDetailsForClient[];
  error?: string;
}> {
  try {
    // 1. チャンネル基本情報を取得 (APIルートを直接叩く代わりにサーバーサイドで直接DBアクセス)
    const { data: channelData, error: channelError } = await supabaseAdmin
      .from('channels')
      .select('id, youtube_channel_id, title, description, published_at, thumbnail_url, subscriber_count, video_count, total_view_count')
      .eq('youtube_channel_id', youtubeChannelId)
      .single();

    if (channelError) throw channelError;
    if (!channelData) return { channel: null, videos: [], error: 'Channel not found' };

    // 2. そのチャンネルの動画一覧を取得
    const { data: videosData, error: videosError } = await supabaseAdmin
      .from('videos')
      .select('id, youtube_video_id, title, thumbnail_url, published_at, view_count, like_count, comment_count')
      .eq('channel_id', channelData.id)
      .order('published_at', { ascending: false })
      .limit(50); // 例: まずは50件、ページネーションは別途検討

    if (videosError) throw videosError;

    return {
      channel: channelData as ChannelDetailsForClient,
      videos: videosData || [],
    };
  } catch (error: unknown) {
    console.error('Error fetching channel page data:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return { channel: null, videos: [], error: errorMessage };
  }
}


export default async function ChannelPage({ params }: PageProps) {
  const { youtubeChannelId } = params;
  const { channel, videos, error } = await getChannelPageData(youtubeChannelId);

  if (error || !channel) {
    return <div className="container mx-auto p-4 text-red-500">Error: {error || 'Channel not found'}</div>;
  }

  return (
    <div className="container mx-auto p-4">
      <ChannelDisplay initialChannel={channel} initialVideos={videos} />
    </div>
  );
}