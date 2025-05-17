// src/app/api/getChannelVideos/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { google, youtube_v3 } from 'googleapis';
import type { GaxiosResponse } from 'gaxios'; // GaxiosResponseをインポート (やはり必要)
import { supabaseAdmin } from '@/lib/supabaseAdmin';

const youtube = google.youtube({
  version: 'v3',
  auth: process.env.YOUTUBE_API_KEY,
});

// VideoToSave インターフェース定義は変更なし
interface VideoToSave {
  youtube_video_id: string;
  channel_id: string;
  title?: string | null;
  description?: string | null;
  published_at?: string | null;
  thumbnail_url?: string | null;
  duration?: string | null;
  tags?: string[] | null;
  category_id?: string | null;
  next_stat_fetch_at?: string | null;
  stat_fetch_frequency_hours?: number | null;
  last_stat_logged_at?: string | null;
  youtube_channel_id_for_fk?: string | null;
  view_count?: number | null;
  like_count?: number | null;
  comment_count?: number | null;
}


export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { youtubeChannelId } = body;

    if (!youtubeChannelId) {
      return NextResponse.json({ message: 'YouTube Channel ID is required' }, { status: 400 });
    }

    const { data: channelData, error: channelError } = await supabaseAdmin
      .from('channels')
      .select('id, uploads_playlist_id')
      .eq('youtube_channel_id', youtubeChannelId)
      .single();

    if (channelError || !channelData || !channelData.uploads_playlist_id) {
      console.error('Error fetching channel from Supabase or uploads_playlist_id missing:', channelError);
      return NextResponse.json({ message: 'Failed to find channel or its uploads playlist ID in DB' }, { status: 404 });
    }
    const supabaseChannelId = channelData.id;
    const uploadsPlaylistId = channelData.uploads_playlist_id;

    let allVideoItems: youtube_v3.Schema$PlaylistItem[] = [];
    let nextPageToken: string | undefined | null = undefined;

    do {
        const playlistItemsResponse: GaxiosResponse<youtube_v3.Schema$PlaylistItemListResponse> =
            await youtube.playlistItems.list({
            part: ['snippet', 'contentDetails'],
            playlistId: uploadsPlaylistId,
            maxResults: 50,
            pageToken: nextPageToken || undefined,
            });

        const playlistItemsData = playlistItemsResponse.data;

        if (playlistItemsData && playlistItemsData.items) {
            allVideoItems = allVideoItems.concat(playlistItemsData.items);
        }
        nextPageToken = playlistItemsData?.nextPageToken;
        } while (nextPageToken);

    if (allVideoItems.length === 0) {
      return NextResponse.json({ message: 'No videos found in the channel playlist.', data: [] });
    }

    const videoIds = allVideoItems
      .map(item => item.contentDetails?.videoId)
      .filter(id => id != null) as string[];

    const allFetchedVideosDetailed: VideoToSave[] = [];

    for (let i = 0; i < videoIds.length; i += 50) {
      const batchVideoIds = videoIds.slice(i, i + 50);
      // ★★★ ここから修正 ★★★
      const response: GaxiosResponse<youtube_v3.Schema$VideoListResponse> = // 型注釈を追加
        await youtube.videos.list({
      // ★★★ ここまで修正 ★★★
        part: ['snippet', 'statistics', 'contentDetails'],
        id: batchVideoIds,
      });

      const videosData = response.data; // response.data は Schema$VideoListResponse | undefined | null 型

      if (videosData && videosData.items) {
        videosData.items.forEach((video: youtube_v3.Schema$Video) => {
          if (video.id) {
            const videoToSave: VideoToSave = {
              youtube_video_id: video.id,
              channel_id: supabaseChannelId,
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
              next_stat_fetch_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
              stat_fetch_frequency_hours: 1,
              last_stat_logged_at: new Date().toISOString(),
              youtube_channel_id_for_fk: video.snippet?.channelId
            };
            allFetchedVideosDetailed.push(videoToSave);
          }
        });
      }
    }

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