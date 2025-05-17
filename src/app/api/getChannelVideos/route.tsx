// src/app/api/getChannelVideos/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { google, youtube_v3 } from 'googleapis';
import { supabaseAdmin } from '@/lib/supabaseAdmin'; // Supabase管理者クライアント

const youtube = google.youtube({
  version: 'v3',
  auth: process.env.YOUTUBE_API_KEY,
});

// videosテーブルとvideo_stats_logsテーブルに保存する際の型 (再利用または新規定義)
interface VideoToSave {
  youtube_video_id: string;
  channel_id: string; // Supabaseのchannelsテーブルのid (uuid)
  title?: string | null;
  description?: string | null;
  published_at?: string | null;
  thumbnail_url?: string | null;
  duration?: string | null;
  tags?: string[] | null;
  category_id?: string | null;
  // スケジュール管理用
  next_stat_fetch_at?: string | null;
  stat_fetch_frequency_hours?: number | null;
  last_stat_logged_at?: string | null;
  // 外部キーとして利用するチャンネルのyoutube_channel_idも一時的に保持
  youtube_channel_id_for_fk?: string | null;
  // 統計情報
  view_count?: number | null;
  like_count?: number | null;
  comment_count?: number | null;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { youtubeChannelId } = body; // フロントからチャンネルのYouTube IDを受け取る

    if (!youtubeChannelId) {
      return NextResponse.json({ message: 'YouTube Channel ID is required' }, { status: 400 });
    }

    // 1. Supabaseからチャンネルの内部IDとuploads_playlist_idを取得
    const { data: channelData, error: channelError } = await supabaseAdmin
      .from('channels')
      .select('id, uploads_playlist_id')
      .eq('youtube_channel_id', youtubeChannelId)
      .single();

    if (channelError || !channelData || !channelData.uploads_playlist_id) {
      console.error('Error fetching channel from Supabase or uploads_playlist_id missing:', channelError);
      return NextResponse.json({ message: 'Failed to find channel or its uploads playlist ID in DB' }, { status: 404 });
    }
    const supabaseChannelId = channelData.id; // Supabase内のchannelsテーブルの主キー
    const uploadsPlaylistId = channelData.uploads_playlist_id;

    let allVideoItems: youtube_v3.Schema$PlaylistItem[] = [];
    let nextPageToken: string | undefined | null = undefined;

    // 2. プレイリスト内の全動画アイテムを取得 (ページネーション対応)
    do {
      const playlistItemsResponse = await youtube.playlistItems.list({
        part: ['snippet', 'contentDetails'],
        playlistId: uploadsPlaylistId,
        maxResults: 50, // 最大50件ずつ
        pageToken: nextPageToken || undefined,
      });

      if (playlistItemsResponse.data.items) {
        allVideoItems = allVideoItems.concat(playlistItemsResponse.data.items);
      }
      nextPageToken = playlistItemsResponse.data.nextPageToken;
    } while (nextPageToken);

    if (allVideoItems.length === 0) {
      return NextResponse.json({ message: 'No videos found in the channel playlist.', data: [] });
    }

    const videoIds = allVideoItems
      .map(item => item.contentDetails?.videoId)
      .filter(id => id != null) as string[];

    const allFetchedVideosDetailed: VideoToSave[] = []; // 修正: const に変更

    // 3. 各動画の詳細情報をバッチで取得 (50件ずつ)
    for (let i = 0; i < videoIds.length; i += 50) {
      const batchVideoIds = videoIds.slice(i, i + 50);
      const videosResponse = await youtube.videos.list({
        part: ['snippet', 'statistics', 'contentDetails'],
        id: batchVideoIds,
      });

      if (videosResponse.data.items) {
        videosResponse.data.items.forEach(video => {
          if (video.id) { // video.id (youtube_video_id) が存在することを確認
            const videoToSave: VideoToSave = {
              youtube_video_id: video.id,
              channel_id: supabaseChannelId, // Supabaseのchannels.idをセット
              title: video.snippet?.title,
              description: video.snippet?.description,
              published_at: video.snippet?.publishedAt,
              thumbnail_url: video.snippet?.thumbnails?.high?.url || video.snippet?.thumbnails?.default?.url,
              duration: video.contentDetails?.duration,
              tags: video.snippet?.tags,
              category_id: video.snippet?.categoryId,
              view_count: video.statistics?.viewCount ? parseInt(video.statistics.viewCount, 10) : null,
              like_count: video.statistics?.likeCount ? parseInt(video.statistics.likeCount, 10) : null,
              comment_count: video.statistics?.commentCount ? parseInt(video.statistics.commentCount, 10) : null,
              next_stat_fetch_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // 1時間後
              stat_fetch_frequency_hours: 1,
              last_stat_logged_at: new Date().toISOString(), // 初回ログは今すぐ
              youtube_channel_id_for_fk: video.snippet?.channelId // 念のため元のチャンネルIDも保持
            };
            allFetchedVideosDetailed.push(videoToSave);
          }
        });
      }
    }

    // 4. SupabaseのvideosテーブルにUpsert
    if (allFetchedVideosDetailed.length > 0) {
      const videosToUpsert = allFetchedVideosDetailed.map(v => ({
        youtube_video_id: v.youtube_video_id,
        channel_id: v.channel_id,
        title: v.title,
        description: v.description,
        published_at: v.published_at,
        thumbnail_url: v.thumbnail_url,
        duration: v.duration,
        tags: v.tags,
        category_id: v.category_id,
        next_stat_fetch_at: v.next_stat_fetch_at,
        stat_fetch_frequency_hours: v.stat_fetch_frequency_hours,
        last_stat_logged_at: v.last_stat_logged_at,
      }));

      const { error: videosUpsertError } = await supabaseAdmin
        .from('videos')
        .upsert(videosToUpsert, { onConflict: 'youtube_video_id' })
        .select();

      if (videosUpsertError) {
        console.error('Supabase error upserting videos:', videosUpsertError);
        return NextResponse.json({ message: 'Error saving video info to Supabase', error: videosUpsertError.message }, { status: 500 });
      }
    }

    return NextResponse.json({
      message: 'Successfully fetched and saved channel videos',
      data: allFetchedVideosDetailed,
    });

  } catch (error: unknown) {
    console.error('Error in POST /api/getChannelVideos:', error);
    let errorMessage = 'Failed to fetch channel videos.';
    if (error instanceof Error) {
      errorMessage = error.message;
    }
    return NextResponse.json({ message: errorMessage, error: errorMessage }, { status: 500 });
  }
}