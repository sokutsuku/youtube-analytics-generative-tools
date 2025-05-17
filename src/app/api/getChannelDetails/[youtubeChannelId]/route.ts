// src/app/api/getChannelDetails/[youtubeChannelId]/route.ts
import { NextResponse } from 'next/server';
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
  // 他に表示したいチャンネル基本情報があれば追加
}

// フロントエンドに返す動画情報の型 (最新統計情報を含む)
interface VideoDetailsForClient {
  id: string; // Supabaseのvideosテーブルのid (uuid)
  youtube_video_id: string;
  title?: string | null;
  thumbnail_url?: string | null;
  published_at?: string | null;
  // videosテーブルにキャッシュしている最新の統計情報
  view_count?: number | null;
  like_count?: number | null;
  comment_count?: number | null;
}

export async function GET(
  request: Request, // NextRequestではなくRequestを使用
  { params }: { params: { youtubeChannelId: string } }
) {
  const youtubeChannelId = params.youtubeChannelId;

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

    if (channelError) throw channelError;
    if (!channelData) {
      return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
    }

    // 2. そのチャンネルの動画一覧 (最新統計情報を含む) を取得
    //    videosテーブルに最新統計をキャッシュしている前提
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
      .eq('channel_id', channelData.id) // channelsテーブルの内部IDで紐付け
      .order('published_at', { ascending: false }); // 例: 公開日の新しい順

    if (videosError) throw videosError;

    const responseData: {
        channel: ChannelDetailsForClient;
        videos: VideoDetailsForClient[];
    } = {
        channel: channelData as ChannelDetailsForClient, // 型アサーション
        videos: videosData || [],
    };

    return NextResponse.json(responseData);

  } catch (error: unknown) {
    console.error('Error fetching channel details:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ error: 'Failed to fetch channel details', details: errorMessage }, { status: 500 });
  }
}