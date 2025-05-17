// src/app/api/getChannelInfo/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { google, youtube_v3 } from 'googleapis';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

const youtube = google.youtube({
  version: 'v3',
  auth: process.env.YOUTUBE_API_KEY,
});

// extractChannelIdentifier 関数は変更なし (ユーザー様提供の正しいものを想定)
async function extractChannelIdentifier(url: string): Promise<{ id?: string; forUsername?: string; handle?: string; error?: string }> {
  try {
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split('/').filter(part => part.length > 0);

    if (pathParts.length > 0) {
      if (pathParts[0] === 'channel' && pathParts[1]) {
        if (pathParts[1].startsWith('UC') && pathParts[1].length === 24) {
            return { id: pathParts[1] };
        }
      }
      if (pathParts[0] === 'user' && pathParts[1]) {
        return { forUsername: pathParts[1] };
      }
      if (pathParts[0].startsWith('@') && pathParts[0].length > 1) {
        const handle = pathParts[0];
        try {
          const searchResponse = await youtube.search.list({
            part: ['snippet'],
            q: handle,
            type: ['channel'],
            maxResults: 1,
          });
          if (searchResponse && searchResponse.data && searchResponse.data.items && searchResponse.data.items.length > 0 && searchResponse.data.items[0].id?.channelId) {
            return { id: searchResponse.data.items[0].id.channelId };
          } else {
            return { error: `Handle "${handle}" not found or not a channel.` };
          }
        } catch (searchError: unknown) {
          console.error(`Error searching for handle "${handle}":`, searchError);
          if (searchError instanceof Error) {
            return { error: `Error resolving handle "${handle}": ${searchError.message}` };
          }
          return { error: `Error resolving handle "${handle}": An unknown error occurred.` };
        }
      }
      const lastPart = pathParts[pathParts.length - 1];
      if (lastPart.startsWith('@')) {
        const handle = lastPart;
         try {
          const searchResponse = await youtube.search.list({
            part: ['snippet'],
            q: handle,
            type: ['channel'],
            maxResults: 1,
          });
          if (searchResponse && searchResponse.data && searchResponse.data.items && searchResponse.data.items.length > 0 && searchResponse.data.items[0].id?.channelId) {
            return { id: searchResponse.data.items[0].id.channelId };
          }
        } catch (searchError: unknown) {
            console.error(`Error searching for handle (last part) "${handle}":`, searchError);
        }
      }
      if (pathParts.length > 0) {
          return { forUsername: pathParts[pathParts.length -1] };
      }
    }
    return { error: 'Could not determine channel identifier from URL.' };
  } catch (e: unknown) {
    console.error('Invalid Channel URL:', e);
    if (e instanceof Error) {
        return { error: `Invalid Channel URL format: ${e.message}` };
    }
    return { error: 'Invalid Channel URL format.' };
  }
}

// Supabaseのchannelsテーブルのカラムに合わせた型
interface ChannelDataToSave {
  youtube_channel_id: string;
  title?: string | null;
  description?: string | null;
  published_at?: string | null;
  thumbnail_url?: string | null;
  country?: string | null;
  subscriber_count?: number | null;
  video_count?: number | null;
  total_view_count?: number | null;
  uploads_playlist_id?: string | null;
  custom_url?: string | null;
  handle?: string | null;
  last_fetched_at: string;
  user_id?: string | null;
  is_public_demo?: boolean;
}

// channel_stats_logs テーブルに保存するデータの型
interface ChannelStatsLogToSave {
    channel_id: string; // Supabaseのchannelsテーブルのid (uuid)
    created_at: string; // ログ作成日時 (fetched_atとして扱う)
    subscriber_count?: number | null;
    video_count?: number | null;
    total_view_count?: number | null;
}

// フロントエンドに返す情報の型
interface ExtractedChannelInfoForClient {
  channelId: string;
  title?: string | null;
  description?: string | null;
  publishedAt?: string | null;
  subscriberCount?: string | null;
  videoCount?: string | null;
  thumbnailUrl?: string | null;
  totalViewCount?: string | null;
  uploadsPlaylistId?: string | null;
}


export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { channelUrl, userId, isPublicDemo } = body;

    if (!channelUrl || typeof channelUrl !== 'string') { /* ...エラー処理... */ }
    const identifier = await extractChannelIdentifier(channelUrl);
    if (identifier.error) { /* ...エラー処理... */ }

    const params: youtube_v3.Params$Resource$Channels$List = {
        part: ['snippet', 'statistics', 'contentDetails', 'brandingSettings'], // 必要なpartを指定
        ...(identifier.id && { id: [identifier.id] }),
        ...(identifier.forUsername && { forUsername: identifier.forUsername }),
    };
    if (!params.id && !params.forUsername) { /* ...エラー処理... */ }

    const youtubeResponse = await youtube.channels.list(params);
    // 1. youtubeResponse.data が存在するかチェック
    if (!youtubeResponse.data) {
      console.error('No data in youtubeResponse:', youtubeResponse);
      return NextResponse.json(
        { message: 'No data received from YouTube API', error: 'YouTube API response missing data' },
        { status: 500 } // サーバー側の問題かAPIの予期せぬ挙動
      );
    }

    // 2. youtubeResponse.data.items が存在し、かつ空でないかチェック
    if (!youtubeResponse.data.items || youtubeResponse.data.items.length === 0) {
      return NextResponse.json(
        { message: 'Channel not found on YouTube (no items in response)', error: 'Channel not found' },
        { status: 404 }
      );
    }
    // この時点で youtubeResponse.data.items は必ず存在し、空でない配列であることが保証される
    const channelDataFromApi = youtubeResponse.data.items[0]; // これで安全にアクセスできる
    const snippet = channelDataFromApi.snippet;
    const statistics = channelDataFromApi.statistics;
    const contentDetails = channelDataFromApi.contentDetails; // もし contentDetails も必ず必要なら、ここで存在チェックを追加

    const nowISO = new Date().toISOString();

    // 1. channels テーブルにUpsertするデータ
    const channelRecordToUpsert: ChannelDataToSave = {
      youtube_channel_id: channelDataFromApi.id!,
      title: snippet?.title,
      description: snippet?.description,
      published_at: snippet?.publishedAt,
      thumbnail_url: snippet?.thumbnails?.high?.url || snippet?.thumbnails?.default?.url,
      country: snippet?.country,
      subscriber_count: statistics?.subscriberCount ? parseInt(statistics.subscriberCount, 10) : null,
      video_count: statistics?.videoCount ? parseInt(statistics.videoCount, 10) : null,
      total_view_count: statistics?.viewCount ? parseInt(statistics.viewCount, 10) : null,
      uploads_playlist_id: contentDetails?.relatedPlaylists?.uploads,
      custom_url: snippet?.customUrl,
      handle: snippet?.customUrl?.startsWith('@') ? snippet.customUrl : null,
      last_fetched_at: nowISO,
      user_id: userId || null,
      is_public_demo: typeof isPublicDemo === 'boolean' ? isPublicDemo : false,
    };

    const { data: savedOrUpdatedChannel, error: upsertError } = await supabaseAdmin
      .from('channels')
      .upsert(channelRecordToUpsert, {
        onConflict: 'youtube_channel_id',
      })
      .select('id, youtube_channel_id') // 内部ID(uuid)とyoutube_channel_idを返す
      .single();

    if (upsertError) {
      console.error('Supabase error upserting channel info:', upsertError);
      return NextResponse.json(
        { message: 'Error saving channel info to Supabase', error: upsertError.message },
        { status: 500 }
      );
    }
    if (!savedOrUpdatedChannel) {
        // このケースはupsertでonConflictが設定されていれば通常は発生しにくいが念のため
        console.error('No data returned after upserting channel, cannot log stats.');
        return NextResponse.json({ message: 'Channel data not saved人口or returned from DB, cannot log stats.' }, { status: 500 });
    }

    // ★★★ ここから channel_stats_logs への保存処理を追加 ★★★
    const statsLogToInsert: ChannelStatsLogToSave = {
      channel_id: savedOrUpdatedChannel.id, // channelsテーブルの内部ID (uuid)
      created_at: nowISO, // ログ作成日時 (API取得日時と同じにする)
      subscriber_count: statistics?.subscriberCount ? parseInt(statistics.subscriberCount, 10) : null,
      video_count: statistics?.videoCount ? parseInt(statistics.videoCount, 10) : null,
      total_view_count: statistics?.viewCount ? parseInt(statistics.viewCount, 10) : null,
    };

    const { error: statsLogError } = await supabaseAdmin
      .from('channel_stats_logs')
      .insert(statsLogToInsert);

    if (statsLogError) {
      // ログ記録のエラーは、メインの処理（チャンネル情報取得）の成否とは分けて考える
      // ここではコンソールにエラーを出力するに留めるが、必要に応じてより詳細なエラーハンドリングを検討
      console.error('Supabase error inserting channel stats log:', statsLogError);
    }
    // ★★★ ここまで追加 ★★★

    console.log('Channel info saved/updated in Supabase. Stats log attempted.', savedOrUpdatedChannel);

    const extractedInfoForClient: ExtractedChannelInfoForClient = {
      channelId: channelDataFromApi.id || 'N/A', // これはYouTubeのチャンネルID
      title: snippet?.title,
      description: snippet?.description,
      publishedAt: snippet?.publishedAt,
      subscriberCount: statistics?.subscriberCount, // APIからの生の文字列
      videoCount: statistics?.videoCount,           // APIからの生の文字列
      thumbnailUrl: snippet?.thumbnails?.high?.url || snippet?.thumbnails?.default?.url,
      totalViewCount: statistics?.viewCount,        // APIからの生の文字列
      uploadsPlaylistId: contentDetails?.relatedPlaylists?.uploads,
    };

    return NextResponse.json({
      message: 'Successfully fetched and saved channel info and stats log',
      data: extractedInfoForClient,
    });

  } catch (error: unknown) {
    // ... (既存の堅牢なエラーハンドリング) ...
    console.error('Error in POST /api/getChannelInfo:', error);
    let errorMessage = 'Failed to fetch channel info.';
    let errorDetails: unknown = 'Unknown error details';
    if (error instanceof Error) {
      errorMessage = error.message;
      errorDetails = error.stack || error.message;
      const gaxiosError = error as any; // Note: This is still 'any', consider specific GaxiosError type if available/needed
      if (gaxiosError.response?.data?.error?.message) {
        errorMessage = `Google API Error: ${gaxiosError.response.data.error.message}`;
        errorDetails = gaxiosError.response.data;
      }
    } else {
      errorMessage = 'An unknown error occurred (not an Error instance).';
      errorDetails = String(error);
    }
    return NextResponse.json(
      { message: errorMessage, error: errorMessage, details: errorDetails },
      { status: 500 }
    );
  }
}