// src/app/api/scheduledVideoStatsFetch/route.ts
import { NextResponse } from 'next/server';
import { google, youtube_v3 } from 'googleapis';
import type { GaxiosResponse } from 'gaxios';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

const youtube = google.youtube({
  version: 'v3',
  auth: process.env.YOUTUBE_API_KEY,
});

interface VideoForStatUpdate {
  id: string; // Supabaseのvideosテーブルのid (uuid)
  youtube_video_id: string;
  // published_at: string; // ユーザー定義の取得頻度ロジックに必要なら
  // stat_fetch_frequency_minutes?: number | null; // もし頻度をDBで管理する場合
}

interface VideoStatsLogToSave {
  video_id: string;
  fetched_at: string;
  view_count?: number | null;
  like_count?: number | null;
  comment_count?: number | null;
}

// 次の正時または30分を計算するヘルパー関数
function getNextScheduledFetchTime(now: Date): Date {
  const currentMinutes = now.getMinutes();
  const scheduledTime = new Date(now.getTime());

  if (currentMinutes < 30) {
    scheduledTime.setMinutes(30, 0, 0); // 次の30分
  } else {
    scheduledTime.setHours(now.getHours() + 1, 0, 0, 0); // 次の正時
  }
  return scheduledTime;
}


export async function GET(request: Request) { // Cron JobからはGETリクエストで呼び出されることが多い
  try {
    const currentTime = new Date();
    console.log(`[${currentTime.toISOString()}] Scheduled video stats fetch job started.`);

    // 1. Supabaseの `videos` テーブルから、統計情報取得タイミングが来た動画を取得
    //    next_stat_fetch_at が現在時刻以前のものを対象
    const { data: videosToUpdate, error: fetchError } = await supabaseAdmin
      .from('videos')
      .select('id, youtube_video_id, published_at, stat_fetch_frequency_hours') // stat_fetch_frequency_hours は一旦残すが、30分固定ロジックでは使わない
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
    const videoScheduleUpdates: Array<Partial<VideoForStatUpdate> & { id: string, next_stat_fetch_at: string, last_stat_logged_at: string }> = [];

    // 2. 動画の統計情報をバッチで取得
    for (let i = 0; i < videoIdsToFetch.length; i += 50) {
      const batchVideoIds = videoIdsToFetch.slice(i, i + 50);
      const videosDetailsResponse: GaxiosResponse<youtube_v3.Schema$VideoListResponse> =
        await youtube.videos.list({
          part: ['statistics'], // 統計情報のみ取得
          id: batchVideoIds,
        });

      if (videosDetailsResponse.data?.items) {
        for (const videoData of videosDetailsResponse.data.items) {
          const correspondingVideoInDb = videosToUpdate.find(v => v.youtube_video_id === videoData.id);
          if (videoData.id && videoData.statistics && correspondingVideoInDb) {
            const fetchedAtISO = new Date().toISOString(); // 実際の取得時刻

            // 3. video_stats_logs に新しい記録としてINSERTする準備
            videoStatsLogsToInsert.push({
              video_id: correspondingVideoInDb.id,
              fetched_at: fetchedAtISO,
              view_count: videoData.statistics.viewCount ? parseInt(videoData.statistics.viewCount, 10) : null,
              like_count: videoData.statistics.likeCount ? parseInt(videoData.statistics.likeCount, 10) : null,
              comment_count: videoData.statistics.commentCount ? parseInt(videoData.statistics.commentCount, 10) : null,
            });

            // 4. videos テーブルのスケジュール情報を更新する準備
            const nextFetchTime = getNextScheduledFetchTime(new Date()); // 現在時刻基準で次の30分/正時

            videoScheduleUpdates.push({
              id: correspondingVideoInDb.id,
              last_stat_logged_at: fetchedAtISO,
              next_stat_fetch_at: nextFetchTime.toISOString(),
              // stat_fetch_frequency_hours: 0.5, // もし時間単位で持ちたいなら (0.5時間 = 30分)
                                                // あるいは固定30分ならこのカラムは不要かも
            });
          }
        }
      }
    }

    // 5. video_stats_logs に一括INSERT
    if (videoStatsLogsToInsert.length > 0) {
      const { error: statsInsertError } = await supabaseAdmin
        .from('video_stats_logs')
        .insert(videoStatsLogsToInsert);
      if (statsInsertError) {
        console.error('Supabase error inserting video_stats_logs:', statsInsertError);
        // エラーがあっても、一部は成功している可能性があるので処理は続ける
      } else {
        console.log(`Inserted ${videoStatsLogsToInsert.length} video stats logs.`);
      }
    }

    // 6. videos テーブルのスケジュール情報を一括UPDATE (Upsertでも良い)
    if (videoScheduleUpdates.length > 0) {
        // Supabaseは一度のupdateで複数の異なる行を異なる値で更新するのが直接的ではないため、
        // 個別にupdateするか、あるいは工夫が必要。ここでは個別にupdateする例。
        // より効率的なのは、PL/pgSQL関数を使うか、あるいはクライアント側でPromise.allを使う。
      for (const update of videoScheduleUpdates) {
        const { error: scheduleUpdateError } = await supabaseAdmin
          .from('videos')
          .update({
            last_stat_logged_at: update.last_stat_logged_at,
            next_stat_fetch_at: update.next_stat_fetch_at,
            // stat_fetch_frequency_hours: update.stat_fetch_frequency_hours, // もし更新するなら
          })
          .eq('id', update.id);
        if (scheduleUpdateError) {
          console.error(`Error updating schedule for video ${update.id}:`, scheduleUpdateError);
        }
      }
      console.log(`Updated schedules for ${videoScheduleUpdates.length} videos.`);
    }

    return NextResponse.json({ message: `Processed stats for ${videosToUpdate.length} videos.` });

  } catch (error: unknown) {
    console.error('Error in scheduledVideoStatsFetch:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred during scheduled fetch.';
    return NextResponse.json({ message: 'Error during scheduled stats fetch', error: errorMessage }, { status: 500 });
  }
}

// videosテーブルのメタデータ更新用API (1日単位) - 別途作成・Cron設定
export async function GET_metadata(request: Request) { // 関数名を変更例
    // videosテーブルの last_metadata_fetched_at を見て、1日以上経過した動画の
    // snippet, contentDetails を youtube.videos.list で取得し、
    // videos テーブルを更新するロジック
    return NextResponse.json({ message: "Metadata update job placeholder." });
}