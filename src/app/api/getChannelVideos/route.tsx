// src/app/api/getChannelVideos/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { google, youtube_v3 } from 'googleapis';
import type { GaxiosResponse } from 'gaxios';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

const youtube = google.youtube({
  version: 'v3',
  auth: process.env.YOUTUBE_API_KEY,
});

interface VideoToSave { // ★★★ 修正: 統計情報を削除 ★★★
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
  // ユーザー情報とデモフラグ
  user_id?: string | null;
  is_public_demo?: boolean;
}

interface VideoStatsLogToSave { // こちらは変更なし
  video_id: string; // Supabaseのvideosテーブルのid (uuid)
  fetched_at: string;
  view_count?: number | null;
  like_count?: number | null;
  comment_count?: number | null;
}


export async function POST(request: NextRequest) {
  try {
    // ... (前半のチャンネル情報取得、動画IDリスト取得までは変更なし) ...
    const body = await request.json();
    const { youtubeChannelId, userId, isPublicDemo } = body;

    if (!youtubeChannelId) { /* ... */ }
    const { data: channelData, error: channelError } = await supabaseAdmin
      .from('channels')
      .select('id, uploads_playlist_id')
      .eq('youtube_channel_id', youtubeChannelId)
      .single();

    // 1. まず channelError をチェック
    if (channelError) {
      console.error('Error fetching channel from Supabase:', channelError);
      // PGRST116 は .single() で0行だった場合のエラーコード
      const errorMessage = channelError.code === 'PGRST116'
        ? `Channel with youtube_channel_id "${youtubeChannelId}" not found in DB.`
        : 'Failed to fetch channel data from DB.';
      return NextResponse.json({ message: errorMessage, details: channelError.message }, { status: 404 });
    }

    // 2. channelError がない場合、channelData の存在と必要なプロパティの存在をチェック
    // .single() を使っていて channelError がなければ、channelData は通常 null にはならないはずだが、念のため
    if (!channelData) {
      console.error('Channel data is unexpectedly null even without an error.');
      return NextResponse.json({ message: 'Channel data not found (unexpectedly null).' }, { status: 404 });
    }

    // 3. uploads_playlist_id の存在をチェック
    if (!channelData.uploads_playlist_id) {
      console.error('uploads_playlist_id is missing for channel:', youtubeChannelId);
      return NextResponse.json({ message: `uploads_playlist_id is missing for channel ${youtubeChannelId}.` }, { status: 404 });
    }

    // この時点で channelData は null ではなく、uploads_playlist_id も存在することが保証される
    const supabaseChannelInternalId = channelData.id; // これで channelData.id が安全にアクセスできる
    const uploadsPlaylistId = channelData.uploads_playlist_id; // これで channelData.uploads_playlist_id が安全にアクセスできる

    let allVideoItemsFromPlaylist: youtube_v3.Schema$PlaylistItem[] = [];
    let nextPageToken: string | undefined | null = undefined;
    do { /* ... (動画IDリスト取得) ... */
      const playlistResponse: GaxiosResponse<youtube_v3.Schema$PlaylistItemListResponse> =
        await youtube.playlistItems.list({
          part: ['contentDetails'],
          playlistId: uploadsPlaylistId,
          maxResults: 50,
          pageToken: nextPageToken || undefined,
        });
      if (playlistResponse.data && playlistResponse.data.items) {
        allVideoItemsFromPlaylist = allVideoItemsFromPlaylist.concat(playlistResponse.data.items);
      }
      nextPageToken = playlistResponse.data?.nextPageToken;
    } while (nextPageToken);

    if (allVideoItemsFromPlaylist.length === 0) { /* ... */ }
    const videoIdsToFetch = allVideoItemsFromPlaylist
      .map(item => item.contentDetails?.videoId)
      .filter(id => id != null) as string[];

    // allFetchedVideosDetailed は VideoToSave[] ではなく、
    // APIからの元データと統計情報を一時的に保持する型にした方が良いかもしれない
    // ここでは、DB保存用と統計ログ保存用の情報をまとめて取得・処理する
    const videosToProcess: Array<VideoToSave & { statistics?: youtube_v3.Schema$VideoStatistics }> = [];


    for (let i = 0; i < videoIdsToFetch.length; i += 50) {
      const batchVideoIds = videoIdsToFetch.slice(i, i + 50);
      const videosDetailsResponse: GaxiosResponse<youtube_v3.Schema$VideoListResponse> =
        await youtube.videos.list({
          part: ['snippet', 'statistics', 'contentDetails'], // statistics も取得
          id: batchVideoIds,
        });

      if (videosDetailsResponse.data && videosDetailsResponse.data.items) {
        videosDetailsResponse.data.items.forEach((video: youtube_v3.Schema$Video) => {
          if (video.id && video.snippet && video.contentDetails) { // statistics はオプショナル
            const nowISO = new Date().toISOString();
            videosToProcess.push({ // ★★★ 修正: statistics も一旦保持 ★★★
              youtube_video_id: video.id,
              channel_id: supabaseChannelInternalId,
              title: video.snippet.title,
              description: video.snippet.description,
              published_at: video.snippet.publishedAt,
              thumbnail_url: video.snippet.thumbnails?.high?.url || video.snippet.thumbnails?.default?.url,
              duration: video.contentDetails.duration,
              tags: video.snippet.tags,
              category_id: video.snippet.categoryId,
              next_stat_fetch_at: new Date(Date.now() + 1 * 60 * 60 * 1000).toISOString(),
              stat_fetch_frequency_hours: 1,
              last_stat_logged_at: nowISO, // 今回ログを記録するので
              user_id: userId || null,
              is_public_demo: typeof isPublicDemo === 'boolean' ? isPublicDemo : false,
              statistics: video.statistics, // ★★★ APIからの統計情報を保持 ★★★
            });
          }
        });
      }
    }

    if (videosToProcess.length === 0) {
      return NextResponse.json({ message: 'No video details fetched from YouTube API.', data: [] });
    }
    
    // 4. videosテーブルへの保存処理 (統計情報は含めない)
    const videosToUpsertForDb = videosToProcess.map((v) => ({ // ★★★ 修正: videosテーブル用 ★★★
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
      user_id: v.user_id,
      is_public_demo: v.is_public_demo,
    }));

    const { data: upsertedVideosData, error: videosUpsertError } = await supabaseAdmin
      .from('videos')
      .upsert(videosToUpsertForDb, { onConflict: 'youtube_video_id' })
      .select('id, youtube_video_id');

    if (videosUpsertError) {
      console.error('Supabase error upserting videos:', videosUpsertError);
      return NextResponse.json({ message: 'Error saving video info to Supabase', error: videosUpsertError.message }, { status: 500 });
    }
    if (!upsertedVideosData) {
        console.error('No data returned after upserting videos, cannot log stats.');
        return NextResponse.json({ message: 'No data returned after upsert, cannot log stats.', data: [] }, { status: 500 });
    }

    // 5. video_stats_logsテーブルへの保存処理
    const statsLogSavePromises = upsertedVideosData.map(savedVideoInDb => {
      // videosToProcess から対応する動画の統計情報を取得
      const originalVideoProcessedData = videosToProcess.find(
        (videoProc) => videoProc.youtube_video_id === savedVideoInDb.youtube_video_id
      );
      if (originalVideoProcessedData && originalVideoProcessedData.statistics) {
        const stats = originalVideoProcessedData.statistics;
        const statsLogToSave: VideoStatsLogToSave = {
          video_id: savedVideoInDb.id, // Supabaseのvideos.id (uuid)
          fetched_at: new Date().toISOString(),
          view_count: stats.viewCount ? parseInt(stats.viewCount, 10) : null,
          like_count: stats.likeCount ? parseInt(stats.likeCount, 10) : null,
          comment_count: stats.commentCount ? parseInt(stats.commentCount, 10) : null,
        };
        return supabaseAdmin.from('video_stats_logs').insert(statsLogToSave);
      }
      return Promise.resolve({ error: null, data: null });
    });

    const statsLogResults = await Promise.all(statsLogSavePromises);
    statsLogResults.forEach(result => {
        if(result.error) {
            console.error('Supabase error inserting a video_stats_log entry:', result.error);
        }
    });

    // フロントエンドに返すデータ (統計情報も含むように調整)
    const fetchedVideosForClientResponse = videosToProcess.map(v => ({
        youtube_video_id: v.youtube_video_id,
        title: v.title,
        thumbnail_url: v.thumbnail_url,
        view_count: v.statistics?.viewCount || 'N/A', // APIからの生の文字列かN/A
        like_count: v.statistics?.likeCount || 'N/A',
        comment_count: v.statistics?.commentCount || 'N/A',
    }));

    return NextResponse.json({
      message: `Successfully fetched and processed ${fetchedVideosForClientResponse.length} videos.`,
      data: fetchedVideosForClientResponse,
    });

  } catch (error: unknown) {
    // ... (既存のエラーハンドリング) ...
    console.error('Error in POST /api/getChannelVideos:', error);
    let errorMessage = 'Failed to fetch channel videos.';
    if (error instanceof Error) {
        errorMessage = error.message;
    }
    return NextResponse.json({ message: errorMessage, error: errorMessage }, { status: 500 });
  }
}