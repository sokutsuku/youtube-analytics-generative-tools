// src/app/api/getChannelDetails/[youtubeChannelId]/route.ts
import { type NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

// フロントエンドに返すチャンネル情報の型
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

// フロントエンドに返す動画情報の型
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

// Supabaseのエラーオブジェクトが持つ可能性のあるプロパティの型
interface SupabaseErrorDetail {
  message: string;
  details?: string | null;
  hint?: string | null;
  code?: string | null;
}

// ApiRouteContext インターフェースは削除します

export async function GET(
  request: NextRequest, // 第一引数
  // ★★★ 第二引数の型注釈を削除し、構造的部分型付けと型推論に任せる ★★★
  context: { params?: { youtubeChannelId?: string | string[] | undefined } } // より緩やかな型付けに変更
) {
  // ★★★ context.params から youtubeChannelId を安全に取り出す ★★★
  const youtubeChannelIdFromParams = context.params?.youtubeChannelId;

  // youtubeChannelId が文字列であることを確認
  if (typeof youtubeChannelIdFromParams !== 'string' || !youtubeChannelIdFromParams) {
    return NextResponse.json({ error: 'YouTube Channel ID is required and must be a string.' }, { status: 400 });
  }
  // ここで string 型であることが保証される
  const youtubeChannelId: string = youtubeChannelIdFromParams;


  try {
    // 1. チャンネル基本情報を取得
    const { data: channelData, error: channelError } = await supabaseAdmin
      .from('channels')
      .select(`
        id,
        youtube_channel_id,
        title,
        description,
        published_at,
        thumbnail_url,
        subscriber_count,
        video_count,
        total_view_count
      `)
      .eq('youtube_channel_id', youtubeChannelId)
      .single();

    if (channelError) {
        console.error(`Supabase error fetching channel (youtubeChannelId: ${youtubeChannelId}):`, JSON.stringify(channelError, null, 2));
        throw channelError;
    }
    if (!channelData) {
      return NextResponse.json({ error: `Channel with ID ${youtubeChannelId} not found` }, { status: 404 });
    }

    // 2. そのチャンネルの動画一覧を取得
    const { data: videosData, error: videosError } = await supabaseAdmin
      .from('videos')
      .select(`
        id,
        youtube_video_id,
        title,
        thumbnail_url,
        published_at,
        view_count,
        like_count,
        comment_count
      `)
      .eq('channel_id', channelData.id)
      .order('published_at', { ascending: false })
      .limit(50);

    if (videosError) {
        console.error(`Supabase error fetching videos for channel (youtubeChannelId: ${youtubeChannelId}, internalChannelId: ${channelData.id}):`, JSON.stringify(videosError, null, 2));
        throw videosError;
    }

    const responseData: {
        channel: ChannelDetailsForClient;
        videos: VideoDetailsForClient[];
    } = {
        channel: channelData as ChannelDetailsForClient,
        videos: (videosData as VideoDetailsForClient[]) || [],
    };

    return NextResponse.json(responseData);

  } catch (error: unknown) {
    console.error(`Error fetching channel details for youtubeChannelId: ${youtubeChannelId}:`, error);
    let errorMessage = 'Failed to fetch channel details.';
    let errorDetailsOutput: SupabaseErrorDetail | string = 'No further details available.';

    if (
        typeof error === 'object' &&
        error !== null &&
        'message' in error &&
        typeof (error as { message?: unknown }).message === 'string' &&
        ('code' in error || 'details' in error || 'hint' in error)
    ) {
      const potentialSupabaseError = error as SupabaseErrorDetail;
      errorMessage = potentialSupabaseError.message;
      errorDetailsOutput = {
          message: potentialSupabaseError.message,
          details: typeof potentialSupabaseError.details === 'string' ? potentialSupabaseError.details : null,
          hint: typeof potentialSupabaseError.hint === 'string' ? potentialSupabaseError.hint : null,
          code: typeof potentialSupabaseError.code === 'string' ? potentialSupabaseError.code : null,
      };
    } else if (error instanceof Error) {
      errorMessage = error.message;
      errorDetailsOutput = error.stack || errorMessage;
    } else if (typeof error === 'string') {
      errorMessage = error;
      errorDetailsOutput = error;
    }

    return NextResponse.json({ error: errorMessage, details: errorDetailsOutput }, { status: 500 });
  }
}