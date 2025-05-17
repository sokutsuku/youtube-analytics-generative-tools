// src/app/channel/[youtubeChannelId]/page.tsx
import ChannelDisplay from '@/components/sections/channelDisplay';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

// フロントエンドに返すチャンネル情報の型
interface ChannelDetailsForClient {
  id: string; // Supabaseのchannelsテーブルのid (uuid)
  youtube_channel_id: string;
  title?: string | null;
  description?: string | null;
  published_at?: string | null;
  thumbnail_url?: string | null;
  subscriber_count?: number | null; // Supabaseのchannelsテーブルから取得 (最新キャッシュ)
  video_count?: number | null;    // Supabaseのchannelsテーブルから取得 (最新キャッシュ)
  total_view_count?: number | null;// Supabaseのchannelsテーブルから取得 (最新キャッシュ)
}

// フロントエンドに返す動画情報の型 (統計情報を削除)
interface VideoDetailsForClient {
  id: string; // Supabaseのvideosテーブルのid (uuid)
  youtube_video_id: string;
  title?: string | null;
  thumbnail_url?: string | null;
  published_at?: string | null;
  // view_count, like_count, comment_count は AccordionItem で別途取得・表示
}

interface PageProps {
  params: {
    youtubeChannelId: string;
  };
}

// Supabaseのエラーオブジェクトが持つ可能性のあるプロパティの型
interface SupabaseErrorDetail {
  message: string;
  details?: string | null;
  hint?: string | null;
  code?: string | null;
}

async function getChannelPageData(youtubeChannelId: string): Promise<{
  channel: ChannelDetailsForClient | null;
  videos: VideoDetailsForClient[]; // 型を修正
  error?: string;
  errorDetails?: SupabaseErrorDetail | string;
}> {
  try {
    // 1. チャンネル基本情報と最新統計情報を取得
    const { data: channelData, error: channelError } = await supabaseAdmin
      .from('channels')
      .select('id, youtube_channel_id, title, description, published_at, thumbnail_url, subscriber_count, video_count, total_view_count')
      .eq('youtube_channel_id', youtubeChannelId)
      .single();

    if (channelError) {
      console.error('Supabase error fetching channel (getChannelPageData):', JSON.stringify(channelError, null, 2));
      throw channelError;
    }
    if (!channelData) {
      console.error('Channel data not found in DB (getChannelPageData) for youtube_channel_id:', youtubeChannelId);
      return { channel: null, videos: [], error: `Channel with ID ${youtubeChannelId} not found in our database.` };
    }

    // 2. そのチャンネルの動画一覧を取得 (メタデータのみ)
    const { data: videosData, error: videosError } = await supabaseAdmin
      .from('videos')
      // ★★★ select から view_count, like_count, comment_count を削除 ★★★
      .select('id, youtube_video_id, title, thumbnail_url, published_at')
      .eq('channel_id', channelData.id)
      .order('published_at', { ascending: false })
      .limit(50); // 例: まずは50件

    if (videosError) {
      console.error('Supabase error fetching videos (getChannelPageData):', JSON.stringify(videosError, null, 2));
      throw videosError;
    }

    return {
      channel: channelData as ChannelDetailsForClient,
      videos: (videosData as VideoDetailsForClient[]) || [], // 型アサーションとnullの場合のフォールバック
    };
  } catch (error: unknown) {
    console.error('Critical error in getChannelPageData for youtubeChannelId:', youtubeChannelId, error);
    let errorMessage = 'An unknown error occurred while fetching channel page data.';
    let errorDetailsOutput: SupabaseErrorDetail | string = 'No further details available.';

    if (typeof error === 'object' && error !== null && 'message' in error) {
      const potentialSupabaseError = error as Partial<SupabaseErrorDetail>;
      errorMessage = typeof potentialSupabaseError.message === 'string' ? potentialSupabaseError.message : errorMessage;
      errorDetailsOutput = {
          message: typeof potentialSupabaseError.message === 'string' ? potentialSupabaseError.message : 'Error message not available.',
          details: typeof potentialSupabaseError.details === 'string' ? potentialSupabaseError.details : null,
          hint: typeof potentialSupabaseError.hint === 'string' ? potentialSupabaseError.hint : null,
          code: typeof potentialSupabaseError.code === 'string' ? potentialSupabaseError.code : null,
      };
      console.error('Formatted Supabase Error (getChannelPageData):', JSON.stringify(errorDetailsOutput, null, 2));
    } else if (error instanceof Error) {
      errorMessage = error.message;
      errorDetailsOutput = error.stack || errorMessage;
      console.error('JavaScript Error (getChannelPageData):', error);
    } else if (typeof error === 'string') {
      errorMessage = error;
      errorDetailsOutput = error;
      console.error('String Error (getChannelPageData):', error);
    } else {
      console.error('Unknown error type (getChannelPageData):', error);
    }
    return { channel: null, videos: [], error: errorMessage, errorDetails: errorDetailsOutput };
  }
}


export default async function ChannelPage({ params }: PageProps) {

  const youtubeChannelId = params.youtubeChannelId;
  console.log("ChannelPage received params:", params);
  if (!youtubeChannelId) {
      return <div className="container mx-auto p-4 text-red-500">Error: Channel ID not found in params.</div>;
  }
  const { channel, videos, error, errorDetails } = await getChannelPageData(youtubeChannelId);

  if (error || !channel) {
    return (
      <div className="container mx-auto p-6 bg-red-50 border-l-4 border-red-500 text-red-700">
        <p className="font-bold">Error Loading Channel Data:</p>
        <p>{error || 'Channel not found or an unexpected error occurred.'}</p>
        {errorDetails && (
          <details className="mt-2 text-sm">
            <summary className="cursor-pointer hover:underline">Error Details</summary>
            <pre className="mt-1 p-2 bg-red-100 text-red-800 rounded overflow-x-auto whitespace-pre-wrap break-all">
              {typeof errorDetails === 'string' ? errorDetails : JSON.stringify(errorDetails, null, 2)}
            </pre>
          </details>
        )}
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4">
      {/* initialVideos には最新統計は含まれないので、ChannelDisplay側で対応が必要 */}
      <ChannelDisplay initialChannel={channel} initialVideos={videos} />
    </div>
  );
}