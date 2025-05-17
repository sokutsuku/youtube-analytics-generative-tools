// src/app/api/getChannelInfo/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { google, youtube_v3 } from 'googleapis';
import { supabaseAdmin } from '@/lib/supabaseAdmin'; // Supabase管理者クライアントをインポート

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


// Supabaseのchannelsテーブルのカラムに合わせた型 (APIレスポンス用とは別に定義)
interface ChannelDataToSave {
  youtube_channel_id: string; // 必須
  title?: string | null;
  description?: string | null;
  published_at?: string | null; // timestamptz
  thumbnail_url?: string | null;
  country?: string | null;
  subscriber_count?: number | null; // bigint
  video_count?: number | null; // bigint
  total_view_count?: number | null; // bigint
  uploads_playlist_id?: string | null;
  custom_url?: string | null;
  handle?: string | null; // APIから直接ハンドル名が取れるか確認 (customUrlに入ることが多い)
  last_fetched_at: string; // timestamptz
  // ユーザー認証導入時に追加するカラム (今回はNULLまたはデフォルト値で対応)
  user_id?: string | null; // uuid
  is_public_demo?: boolean; // boolean, default false
}

// フロントエンドに返す情報の型 (既存のExtractedChannelInfoを流用または調整)
interface ExtractedChannelInfoForClient {
  channelId: string; // youtube_channel_id
  title?: string | null;
  description?: string | null;
  publishedAt?: string | null;
  subscriberCount?: string | null; // APIからは文字列で来るので、DB保存時に数値化
  videoCount?: string | null;
  thumbnailUrl?: string | null;
  totalViewCount?: string | null;
  uploadsPlaylistId?: string | null; // 追加: これがないと動画一覧が取れない
}


export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { channelUrl, userId, isPublicDemo } = body; // userId と isPublicDemo も受け取れるようにする (任意)

    if (!channelUrl || typeof channelUrl !== 'string') {
      return NextResponse.json(
        { message: 'Channel URL is required', error: 'Channel URL is required' },
        { status: 400 }
      );
    }

    const identifier = await extractChannelIdentifier(channelUrl);

    if (identifier.error) {
      return NextResponse.json(
        { message: `Failed to parse channel URL: ${identifier.error}`, error: identifier.error },
        { status: 400 }
      );
    }

    const params: youtube_v3.Params$Resource$Channels$List = {
        part: ['snippet', 'statistics', 'contentDetails', 'brandingSettings'], // contentDetails, brandingSettingsも追加
        ...(identifier.id && { id: [identifier.id] }),
        ...(identifier.forUsername && { forUsername: identifier.forUsername }),
    };

    if (!params.id && !params.forUsername) {
        return NextResponse.json(
            { message: 'Could not determine channel ID or username from URL for API params.', error: 'Identifier not resolved for params' },
            { status: 400 }
        );
    }

    const youtubeResponse = await youtube.channels.list(params);

    if (!youtubeResponse.data.items || youtubeResponse.data.items.length === 0) {
      return NextResponse.json(
        { message: 'Channel not found on YouTube', error: 'Channel not found' },
        { status: 404 }
      );
    }

    const channelData = youtubeResponse.data.items[0];
    const snippet = channelData.snippet;
    const statistics = channelData.statistics;
    const contentDetails = channelData.contentDetails;
    // const brandingSettings = channelData.brandingSettings; // 必要なら使う

    // Supabaseに保存するためのデータ整形
    const dataToSave: ChannelDataToSave = {
      youtube_channel_id: channelData.id!, // IDは必須
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
      handle: snippet?.customUrl?.startsWith('@') ? snippet.customUrl : null, // 簡単なハンドル抽出 (要改善)
      last_fetched_at: new Date().toISOString(),
      user_id: userId || null, // フロントから渡されたuserId、なければNULL
      is_public_demo: typeof isPublicDemo === 'boolean' ? isPublicDemo : false, // フロントから渡されたフラグ
    };

    // SupabaseにUpsert
    const { data: savedChannel, error: supabaseError } = await supabaseAdmin
      .from('channels')
      .upsert(dataToSave, {
        onConflict: 'youtube_channel_id', // youtube_channel_id がユニークキーである前提
      })
      .select() // 保存/更新されたデータを返す
      .single(); // 1行返ることを期待

    if (supabaseError) {
      console.error('Supabase error upserting channel info:', supabaseError);
      return NextResponse.json(
        { message: 'Error saving channel info to Supabase', error: supabaseError.message },
        { status: 500 }
      );
    }

    console.log('Channel info saved/updated in Supabase:', savedChannel);

    // フロントエンドに返すデータ (APIから取得した生の統計情報も文字列で返す)
    const extractedInfoForClient: ExtractedChannelInfoForClient = {
      channelId: channelData.id || 'N/A',
      title: snippet?.title,
      description: snippet?.description,
      publishedAt: snippet?.publishedAt,
      subscriberCount: statistics?.subscriberCount,
      videoCount: statistics?.videoCount,
      thumbnailUrl: snippet?.thumbnails?.high?.url || snippet?.thumbnails?.default?.url,
      totalViewCount: statistics?.viewCount,
      uploadsPlaylistId: contentDetails?.relatedPlaylists?.uploads, // 追加
    };

    return NextResponse.json({
      message: 'Successfully fetched and saved channel info',
      data: extractedInfoForClient, // フロントエンド向けのデータを返す
    });

  } catch (error: unknown) {
    // ... (既存の堅牢なエラーハンドリング) ...
    console.error('Error in POST /api/getChannelInfo:', error);
    let errorMessage = 'Failed to fetch channel info.';
    let errorDetails: unknown = 'Unknown error details';
    if (error instanceof Error) {
      errorMessage = error.message;
      errorDetails = error.stack || error.message;
      const gaxiosError = error as any;
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