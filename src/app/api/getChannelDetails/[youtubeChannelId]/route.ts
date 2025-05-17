// src/app/api/getChannelDetails/[youtubeChannelId]/route.ts
import { NextRequest, NextResponse } from 'next/server';
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

// Next.jsのAPIルートハンドラの第二引数 context の型をより汎用的に
// (Next.jsの内部型に合わせるか、構造的に一致させる)
interface ApiRouteContext {
  params?: { [key: string]: string | string[] | undefined }; // params が存在し、その値が文字列または文字列配列
}


export async function GET(
  request: NextRequest, // 第一引数は NextRequest
  context: ApiRouteContext // ★★★ 第二引数の型を ApiRouteContext に ★★★
) {
  // ★★★ context.params から youtubeChannelId を安全に取り出す ★★★
  const youtubeChannelId = context.params?.youtubeChannelId;

  // youtubeChannelId が文字列であることを確認 (string[] の可能性も考慮する場合はさらに分岐)
  if (typeof youtubeChannelId !== 'string' || !youtubeChannelId) {
    return NextResponse.json({ error: 'YouTube Channel ID is required and must be a string.' }, { status: 400 });
  }

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
        // エラーオブジェクトをそのまま throw し、catch ブロックで処理
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

    // Supabaseのエラーオブジェクトかどうかの判定を強化
    if (
        typeof error === 'object' &&
        error !== null &&
        'message' in error && typeof (error as { message: any }).message === 'string' && // message プロパティがあるか
        ('code' in error || 'details' in error || 'hint' in error) // Supabase/PostgrestError特有のプロパティがあるか
    ) {
      const potentialSupabaseError = error as SupabaseErrorDetail; // より具体的な型にアサーション
      errorMessage = potentialSupabaseError.message;
      errorDetailsOutput = { // エラー詳細をオブジェクトとして保持
          message: potentialSupabaseError.message,
          details: potentialSupabaseError.details,
          hint: potentialSupabaseError.hint,
          code: potentialSupabaseError.code,
      };
    } else if (error instanceof Error) { // 通常のJavaScript Errorオブジェクトの場合
      errorMessage = error.message;
      errorDetailsOutput = error.stack || errorMessage;
    } else if (typeof error === 'string') { // 文字列としてエラーがスローされた場合
      errorMessage = error;
      errorDetailsOutput = error;
    }
    // 他の予期せぬエラータイプの場合は、初期値のメッセージが使われる

    return NextResponse.json({ error: errorMessage, details: errorDetailsOutput }, { status: 500 });
  }
}