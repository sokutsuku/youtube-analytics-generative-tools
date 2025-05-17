// src/app/api/getChannelInfo/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { google, youtube_v3 } from 'googleapis';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

const youtube = google.youtube({
  version: 'v3',
  auth: process.env.YOUTUBE_API_KEY,
});

// extractChannelIdentifier 関数は変更なし
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

// 型定義は変更なし
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
    // ... (tryブロックの前半は変更なし) ...
    const body = await request.json();
    const { channelUrl, userId, isPublicDemo } = body;

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
        part: ['snippet', 'statistics', 'contentDetails', 'brandingSettings'],
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

    const dataToSave: ChannelDataToSave = {
      youtube_channel_id: channelData.id!,
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
      last_fetched_at: new Date().toISOString(),
      user_id: userId || null,
      is_public_demo: typeof isPublicDemo === 'boolean' ? isPublicDemo : false,
    };

    const { data: savedChannel, error: supabaseError } = await supabaseAdmin
      .from('channels')
      .upsert(dataToSave, {
        onConflict: 'youtube_channel_id',
      })
      .select()
      .single();

    if (supabaseError) {
      console.error('Supabase error upserting channel info:', supabaseError);
      return NextResponse.json(
        { message: 'Error saving channel info to Supabase', error: supabaseError.message },
        { status: 500 }
      );
    }

    console.log('Channel info saved/updated in Supabase:', savedChannel);

    const extractedInfoForClient: ExtractedChannelInfoForClient = {
      channelId: channelData.id || 'N/A',
      title: snippet?.title,
      description: snippet?.description,
      publishedAt: snippet?.publishedAt,
      subscriberCount: statistics?.subscriberCount,
      videoCount: statistics?.videoCount,
      thumbnailUrl: snippet?.thumbnails?.high?.url || snippet?.thumbnails?.default?.url,
      totalViewCount: statistics?.viewCount,
      uploadsPlaylistId: contentDetails?.relatedPlaylists?.uploads,
    };

    return NextResponse.json({
      message: 'Successfully fetched and saved channel info',
      data: extractedInfoForClient,
    });

  } catch (error: unknown) { // catchの型を unknown に
    console.error('Error in POST /api/getChannelInfo:', error);
    let errorMessage = 'Failed to fetch channel info.';
    let errorDetails: unknown = 'Unknown error details'; // 初期値を設定

    if (error instanceof Error) {
      errorMessage = error.message; // まずは基本的なエラーメッセージを設定
      errorDetails = error.stack || error.message; // スタックトレースかメッセージを詳細として設定

      // GaxiosErrorのような構造を持つかチェック (より安全に)
      // `error` オブジェクトが `response` プロパティを持ち、
      // その `response` が `data` プロパティを持ち、
      // さらにその `data` が `error` プロパティを持ち、
      // その `error` が `message` プロパティを持つか、を段階的に確認
      if (
        typeof error === 'object' &&
        error !== null &&
        'response' in error && // error オブジェクトに response プロパティがあるか
        error.response !== null &&
        typeof error.response === 'object' &&
        'data' in error.response && // error.response に data プロパティがあるか
        error.response.data !== null &&
        typeof error.response.data === 'object' &&
        'error' in error.response.data && // error.response.data に error プロパティがあるか
        error.response.data.error !== null &&
        typeof error.response.data.error === 'object' &&
        'message' in error.response.data.error && // error.response.data.error に message プロパティがあるか
        typeof error.response.data.error.message === 'string'
      ) {
        // 型チェックが通った後に安全にアクセス
        const gaxiosSpecificErrorMessage = (error.response.data.error as { message: string }).message;
        errorMessage = `Google API Error: ${gaxiosSpecificErrorMessage}`;
        errorDetails = error.response.data; // response.data全体を詳細として保持
      }
    } else {
      // Errorインスタンスではない場合
      errorMessage = 'An unknown error occurred (not an Error instance).';
      if (typeof error === 'string') {
        errorDetails = error;
      } else {
        try {
          errorDetails = JSON.stringify(error); // 念のため stringify も試みる
        } catch {
          // stringify できない場合はそのまま
        }
      }
    }

    return NextResponse.json(
      { message: errorMessage, error: errorMessage, details: errorDetails },
      { status: 500 }
    );
  }
}