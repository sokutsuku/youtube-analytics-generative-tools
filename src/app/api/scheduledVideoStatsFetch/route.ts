// src/app/api/scheduledVideoStatsFetch/route.ts
import { NextResponse } from 'next/server';
import { google, youtube_v3 } from 'googleapis';
import type { GaxiosResponse } from 'gaxios';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

const youtube = google.youtube({
  version: 'v3',
  auth: process.env.YOUTUBE_API_KEY,
});

interface VideoStatsLogToSave {
  video_id: string;
  fetched_at: string;
  view_count?: number | null;
  like_count?: number | null;
  comment_count?: number | null;
}

async function GET() {
  try {
    const currentTime = new Date();
    console.log(`[${currentTime.toISOString()}] Scheduled video stats fetch job started.`);

    const { data: videosToUpdate, error: fetchError } = await supabaseAdmin
      .from('videos')
      .select('id, youtube_video_id, published_at, stat_fetch_frequency_hours')
      .lte('next_stat_fetch_at', currentTime.toISOString());

    if (fetchError) {
      console.error('Error fetching videos to update stats:', fetchError);
      throw fetchError;
    }

    if (!videosToUpdate || videosToUpdate.length === 0) {
      console.log('No videos due for stats update at this time.');
      return NextResponse.json({ message: 'No videos due for stats update.' });
    }

    console.log(`Found ${videosToUpdate.length} videos to update stats.`);
    const videoIdsToFetch = videosToUpdate.map(v => v.youtube_video_id);
    const videoStatsLogsToInsert: VideoStatsLogToSave[] = [];
    const videoScheduleUpdates: Array<{
      id: string;
      next_stat_fetch_at: string;
      last_stat_logged_at: string;
      view_count?: number | null;
      like_count?: number | null;
      comment_count?: number | null;
      stat_fetch_frequency_hours?: number | null;
    }> = [];

    for (let i = 0; i < videoIdsToFetch.length; i += 50) {
      const batchVideoIds = videoIdsToFetch.slice(i, i + 50);
      const videosDetailsResponse: GaxiosResponse<youtube_v3.Schema$VideoListResponse> =
        await youtube.videos.list({
          part: ['statistics'],
          id: batchVideoIds,
        });

      if (videosDetailsResponse.data?.items) {
        for (const videoData of videosDetailsResponse.data.items) {
          const correspondingVideoInDb = videosToUpdate.find(v => v.youtube_video_id === videoData.id);
          if (videoData.id && videoData.statistics && correspondingVideoInDb) {
            const fetchedAtISO = new Date().toISOString();

            videoStatsLogsToInsert.push({
              video_id: correspondingVideoInDb.id,
              fetched_at: fetchedAtISO,
              view_count: videoData.statistics.viewCount ? parseInt(videoData.statistics.viewCount, 10) : null,
              like_count: videoData.statistics.likeCount ? parseInt(videoData.statistics.likeCount, 10) : null,
              comment_count: videoData.statistics.commentCount ? parseInt(videoData.statistics.commentCount, 10) : null,
            });

            const publishedDate = new Date(correspondingVideoInDb.published_at || 0);
            const hoursSincePublished = (currentTime.getTime() - publishedDate.getTime()) / (1000 * 60 * 60);

            let nextFetchFrequencyHours = 24;
            if (hoursSincePublished <= 24) {
              nextFetchFrequencyHours = 1;
            } else if (hoursSincePublished <= 72) {
              nextFetchFrequencyHours = 3;
            }

            const nextFetchTime = new Date(currentTime.getTime() + nextFetchFrequencyHours * 60 * 60 * 1000);

            videoScheduleUpdates.push({
              id: correspondingVideoInDb.id,
              last_stat_logged_at: fetchedAtISO,
              next_stat_fetch_at: nextFetchTime.toISOString(),
              stat_fetch_frequency_hours: nextFetchFrequencyHours,
              view_count: videoData.statistics.viewCount ? parseInt(videoData.statistics.viewCount, 10) : null,
              like_count: videoData.statistics.likeCount ? parseInt(videoData.statistics.likeCount, 10) : null,
              comment_count: videoData.statistics.commentCount ? parseInt(videoData.statistics.commentCount, 10) : null,
            });
          }
        }
      }
    }

    if (videoStatsLogsToInsert.length > 0) {
      const { error: statsInsertError } = await supabaseAdmin
        .from('video_stats_logs')
        .insert(videoStatsLogsToInsert);
      if (statsInsertError) {
        console.error('Supabase error inserting video_stats_logs:', statsInsertError);
      } else {
        console.log(`Inserted ${videoStatsLogsToInsert.length} video stats logs.`);
      }
    }

    if (videoScheduleUpdates.length > 0) {
      for (const update of videoScheduleUpdates) {
        const { error: scheduleUpdateError } = await supabaseAdmin
          .from('videos')
          .update({
            last_stat_logged_at: update.last_stat_logged_at,
            next_stat_fetch_at: update.next_stat_fetch_at,
            stat_fetch_frequency_hours: update.stat_fetch_frequency_hours,
            view_count: update.view_count,
            like_count: update.like_count,
            comment_count: update.comment_count,
          })
          .eq('id', update.id);
        if (scheduleUpdateError) {
          console.error(`Error updating schedule for video ${update.id}:`, scheduleUpdateError);
        }
      }
      console.log(`Updated schedules for ${videoScheduleUpdates.length} videos.`);
    }

    return NextResponse.json({ message: `Processed stats for ${videosToUpdate?.length || 0} videos.` });

  } catch (error: unknown) {
    console.error('Error in scheduledVideoStatsFetch:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred during scheduled fetch.';
    return NextResponse.json({ message: 'Error during scheduled stats fetch', error: errorMessage }, { status: 500 });
  }
}

// デフォルトエクスポートとしてGETをエクスポート
export default GET;