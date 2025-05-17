// src/app/api/getChannelVideos/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { google, youtube_v3 } from 'googleapis';
import type { GaxiosResponse } from 'gaxios';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

const youtube = google.youtube({
  version: 'v3',
  auth: process.env.YOUTUBE_API_KEY,
});

interface VideoMetadataToSave {
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
  user_id?: string | null;
  is_public_demo?: boolean;
  view_count?: number | null;
  like_count?: number | null;
  comment_count?: number | null;
}

interface VideoStatsLogToSave {
  video_id: string;
  fetched_at: string;
  view_count?: number | null;
  like_count?: number | null;
  comment_count?: number | null;
}

interface FetchedVideoDetailWithStats {
  youtube_video_id: string;
  channel_id: string;
  title?: string | null;
  description?: string | null;
  published_at?: string | null;
  thumbnail_url?: string | null;
  duration?: string | null;
  tags?: string[] | null;
  category_id?: string | null;
  statistics?: youtube_v3.Schema$VideoStatistics | null;
  next_stat_fetch_at: string;
  stat_fetch_frequency_hours: number;
  last_stat_logged_at: string;
  user_id?: string | null;
  is_public_demo?: boolean;
}

interface ClientVideoInfo {
  youtube_video_id: string;
  title?: string | null;
  thumbnail_url?: string | null;
  latest_view_count?: string | null;
  latest_like_count?: string | null;
  latest_comment_count?: string | null;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { youtubeChannelId, userId, isPublicDemo } = body;

    if (!youtubeChannelId) {
      return NextResponse.json({ message: 'YouTube Channel ID is required' }, { status: 400 });
    }

    const { data: channelData, error: channelError } = await supabaseAdmin
      .from('channels')
      .select('id, uploads_playlist_id')
      .eq('youtube_channel_id', youtubeChannelId)
      .single();

    // ★★★ channelData の null チェックを強化 ★★★
    if (channelError) {
      console.error('Error fetching channel from Supabase (getChannelVideos):', channelError);
      const message = channelError.code === 'PGRST116' ? `Channel with youtube_channel_id "${youtubeChannelId}" not found.` : 'Failed to fetch channel data.';
      return NextResponse.json({ message, details: channelError.message }, { status: 404 });
    }
    if (!channelData) { // .single() でエラーがない場合、通常 channelData は存在するが念のため
        console.error('Channel data is unexpectedly null even without an error (getChannelVideos). youtubeChannelId:', youtubeChannelId);
        return NextResponse.json({ message: 'Channel data not found (unexpectedly null).' }, { status: 404 });
    }
    if (!channelData.uploads_playlist_id) {
        console.error('uploads_playlist_id is missing for channel (getChannelVideos):', youtubeChannelId);
        return NextResponse.json({ message: `uploads_playlist_id is missing for channel ${youtubeChannelId}.` }, { status: 404 });
    }
    // ★★★ ここまで修正 ★★★

    const supabaseChannelInternalId = channelData.id; // この時点で channelData は null ではない
    const uploadsPlaylistId = channelData.uploads_playlist_id; // この時点で channelData.uploads_playlist_id は null ではない

    let allPlaylistItems: youtube_v3.Schema$PlaylistItem[] = [];
    let nextPageToken: string | undefined | null = undefined;

    do {
      const playlistResponse: GaxiosResponse<youtube_v3.Schema$PlaylistItemListResponse> =
        await youtube.playlistItems.list({
          part: ['contentDetails'],
          playlistId: uploadsPlaylistId, maxResults: 50, pageToken: nextPageToken || undefined,
        });
      if (playlistResponse.data?.items) {
        allPlaylistItems = allPlaylistItems.concat(playlistResponse.data.items);
      }
      nextPageToken = playlistResponse.data?.nextPageToken;
    } while (nextPageToken);

    if (allPlaylistItems.length === 0) {
      return NextResponse.json({ message: 'No videos found in the channel playlist.', data: [] });
    }

    const videoIdsToFetch = allPlaylistItems.map(item => item.contentDetails?.videoId).filter(id => id != null) as string[];
    
    const fetchedVideoDetails: FetchedVideoDetailWithStats[] = [];
    const nowISO = new Date().toISOString();

    for (let i = 0; i < videoIdsToFetch.length; i += 50) {
      const batchVideoIds = videoIdsToFetch.slice(i, i + 50);
      const videosDetailsResponse: GaxiosResponse<youtube_v3.Schema$VideoListResponse> =
        await youtube.videos.list({
          part: ['snippet', 'statistics', 'contentDetails'], id: batchVideoIds,
        });

      if (videosDetailsResponse.data?.items) {
        for (const video of videosDetailsResponse.data.items) {
          if (video.id && video.snippet && video.contentDetails) {
            fetchedVideoDetails.push({
              youtube_video_id: video.id,
              channel_id: supabaseChannelInternalId,
              title: video.snippet.title,
              description: video.snippet.description,
              published_at: video.snippet.publishedAt,
              thumbnail_url: video.snippet.thumbnails?.high?.url || video.snippet.thumbnails?.default?.url,
              duration: video.contentDetails.duration,
              tags: video.snippet.tags,
              category_id: video.snippet.categoryId,
              statistics: video.statistics,
              next_stat_fetch_at: new Date(Date.now() + 1 * 60 * 60 * 1000).toISOString(),
              stat_fetch_frequency_hours: 1,
              last_stat_logged_at: nowISO,
              user_id: userId || null,
              is_public_demo: typeof isPublicDemo === 'boolean' ? isPublicDemo : false,
            });
          }
        }
      }
    }

    if (fetchedVideoDetails.length === 0) {
      return NextResponse.json({ message: 'No video details could be processed from YouTube API.', data: [] });
    }
    
    const videoMetadatasToUpsert: VideoMetadataToSave[] = fetchedVideoDetails.map(detail => ({
      youtube_video_id: detail.youtube_video_id,
      channel_id: detail.channel_id,
      title: detail.title,
      description: detail.description,
      published_at: detail.published_at,
      thumbnail_url: detail.thumbnail_url,
      duration: detail.duration,
      tags: detail.tags,
      category_id: detail.category_id,
      next_stat_fetch_at: detail.next_stat_fetch_at,
      stat_fetch_frequency_hours: detail.stat_fetch_frequency_hours,
      last_stat_logged_at: detail.last_stat_logged_at,
      user_id: detail.user_id,
      is_public_demo: detail.is_public_demo,
      view_count: detail.statistics?.viewCount ? parseInt(detail.statistics.viewCount, 10) : null,
      like_count: detail.statistics?.likeCount ? parseInt(detail.statistics.likeCount, 10) : null,
      comment_count: detail.statistics?.commentCount ? parseInt(detail.statistics.commentCount, 10) : null,
    }));

    const { data: upsertedVideosData, error: videosUpsertError } = await supabaseAdmin
      .from('videos')
      .upsert(videoMetadatasToUpsert, { onConflict: 'youtube_video_id' })
      .select('id, youtube_video_id');

    if (videosUpsertError) {
      console.error('Supabase error upserting videos:', videosUpsertError);
      return NextResponse.json({ message: 'Error saving video metadata to Supabase', error: videosUpsertError.message }, { status: 500 });
    }
    // ★★★ upsertedVideosData の null チェック ★★★
    if (!upsertedVideosData) {
        console.error('No data returned after upserting videos, cannot log stats.');
        // null の場合は空配列として扱うか、エラーにするか選択
        // 今回は後続のループが空になるだけなので、このまま進めても良いが、エラーの方が明確
        return NextResponse.json({ message: 'Upsert operation did not return data for videos.', data: [] }, { status: 500 });
    }
    // ★★★ ここまで修正 ★★★

    const statsLogsToInsert: VideoStatsLogToSave[] = [];
    // ★★★ upsertedVideosData (nullでないことが保証された) をループ ★★★
    for (const savedVideo of upsertedVideosData) {
      const originalDetail = fetchedVideoDetails.find(detail => detail.youtube_video_id === savedVideo.youtube_video_id);
      if (originalDetail && originalDetail.statistics) {
        statsLogsToInsert.push({
          video_id: savedVideo.id,
          fetched_at: nowISO,
          view_count: originalDetail.statistics.viewCount ? parseInt(originalDetail.statistics.viewCount, 10) : null,
          like_count: originalDetail.statistics.likeCount ? parseInt(originalDetail.statistics.likeCount, 10) : null,
          comment_count: originalDetail.statistics.commentCount ? parseInt(originalDetail.statistics.commentCount, 10) : null,
        });
      }
    }

    if (statsLogsToInsert.length > 0) {
      const { error: statsInsertError } = await supabaseAdmin
        .from('video_stats_logs')
        .insert(statsLogsToInsert);
      if (statsInsertError) {
        console.error('Supabase error inserting video_stats_logs:', statsInsertError);
      }
    }

    const clientResponseData: ClientVideoInfo[] = fetchedVideoDetails.map(detail => ({
        youtube_video_id: detail.youtube_video_id,
        title: detail.title,
        thumbnail_url: detail.thumbnail_url,
        latest_view_count: detail.statistics?.viewCount || null,
        latest_like_count: detail.statistics?.likeCount || null,
        latest_comment_count: detail.statistics?.commentCount || null,
    }));

    return NextResponse.json({
      message: `Successfully fetched and processed ${clientResponseData.length} videos. Statistics logged.`,
      data: clientResponseData,
    });

  } catch (error: unknown) {
    console.error('Error in POST /api/getChannelVideos:', error);
    let errorMessage = 'Failed to fetch and save channel videos.';
    if (error instanceof Error) {
        errorMessage = error.message;
    }
    return NextResponse.json({ message: errorMessage, error: errorMessage }, { status: 500 });
  }
}