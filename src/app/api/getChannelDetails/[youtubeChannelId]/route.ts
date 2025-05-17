// src/app/api/getChannelDetails/[youtubeChannelId]/route.ts
import { NextRequest, NextResponse } from 'next/server'; // NextRequest をインポート
import { supabaseAdmin } from '@/lib/supabaseAdmin';

// フロントエンドに返すチャンネル情報の型
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

// フロントエンドに返す動画情報の型
interface VideoDetailsForClient {
  id: string;
  youtube_video_id: string;
  title?: string | null;
  thumbnail_url?: string | null;
  published_at?: string | null;
  view_count?: number | null;
  like_count?: number | null;
  comment_count?: number | null;
}

// Supabaseのエラーオブジェクトが持つ可能性のあるプロパティの型 (page.tsxと共通化推奨)
interface SupabaseErrorDetail {
  message: string;
  details?: string | null;
  hint?: string | null;
  code?: string | null;
}

// ★★★ GET関数のシグネチャを修正 ★★★
export async function GET(
  request: NextRequest, // 第一引数を NextRequest に (標準の Request でも動作するが大文字の NextRequest が推奨される場合あり)
  context: { params: { youtubeChannelId: string } } // 第二引数を context オブジェクトとして受け取る
) {
  const { params } = context; // context から params を取り出す
  const youtubeChannelId = params.youtubeChannelId;
  // ★★★ ここまで修正 ★★★

  if (!youtubeChannelId) {
    return NextResponse.json({ error: 'YouTube Channel ID is required' }, { status: 400 });
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
        console.error('Supabase error fetching channel (getChannelDetails):', JSON.stringify(channelError, null, 2));
        throw channelError; // エラーをcatchブロックで処理
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
      .limit(50); // 例: まずは50件

    if (videosError) {
        console.error('Supabase error fetching videos (getChannelDetails):', JSON.stringify(videosError, null, 2));
        throw videosError; // エラーをcatchブロックで処理
    }

    const responseData: {
        channel: ChannelDetailsForClient;
        videos: VideoDetailsForClient[];
    } = {
        channel: channelData as ChannelDetailsForClient,
        videos: (videosData as VideoDetailsForClient[]) || [], // videosData が null の場合は空配列
    };

    return NextResponse.json(responseData);

  } catch (error: unknown) {
    console.error(`Error fetching channel details for ${youtubeChannelId}:`, error);
    let errorMessage = 'Failed to fetch channel details.';
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