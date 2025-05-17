// src/app/api/getChannelInfo/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { google, youtube_v3 } from 'googleapis';
import type { GaxiosError, GaxiosResponse } from 'gaxios'; // GaxiosErrorもインポート
import { supabaseAdmin } from '@/lib/supabaseAdmin';

const youtube = google.youtube({
  version: 'v3',
  auth: process.env.YOUTUBE_API_KEY,
});

async function extractChannelIdentifier(
  url: string
): Promise<{ id?: string; forUsername?: string; handle?: string; error?: string }> {
  try {
    let pathParts: string[] = [];
    let isLikelyUrl = false;
    if (url.includes('/') || url.includes('.') || url.toLowerCase().startsWith('http')) {
      try {
        const urlObj = new URL(url.startsWith('http') ? url : `http://${url}`);
        pathParts = urlObj.pathname.split('/').filter(part => part.length > 0);
        isLikelyUrl = true;
      } catch {
        pathParts = [];
        isLikelyUrl = false;
      }
    }

    if (isLikelyUrl && pathParts.length > 0) {
      if (pathParts[0] === 'channel' && pathParts[1]?.startsWith('UC') && pathParts[1].length === 24) {
        return { id: pathParts[1] };
      }
      if (pathParts[0] === 'user' && pathParts[1]) {
        return { forUsername: pathParts[1] };
      }
      const lastPart = pathParts[pathParts.length - 1];
      if (lastPart.startsWith('@') && lastPart.length > 1) {
        const handle = lastPart;
        try {
          const searchResponse: GaxiosResponse<youtube_v3.Schema$SearchListResponse> =
            await youtube.search.list({ part: ['snippet'], q: handle, type: ['channel'], maxResults: 1 });
          if (searchResponse.data.items?.[0]?.id?.channelId) {
            return { id: searchResponse.data.items[0].id.channelId };
          }
          return { error: `Handle "${handle}" (from URL path) not found.` };
        } catch (searchError: unknown) {
          console.error(`Error searching for handle "${handle}" (from URL path):`, searchError);
          if (searchError instanceof Error) return { error: `Error resolving handle "${handle}": ${searchError.message}`};
          return { error: `Unknown error resolving handle "${handle}"`};
        }
      }
    } else if (url.startsWith('@') && url.length > 1) {
      const handle = url;
      try {
        const searchResponse: GaxiosResponse<youtube_v3.Schema$SearchListResponse> =
          await youtube.search.list({ part: ['snippet'], q: handle, type: ['channel'], maxResults: 1 });
        if (searchResponse.data.items?.[0]?.id?.channelId) {
          return { id: searchResponse.data.items[0].id.channelId };
        }
        return { error: `Handle "${handle}" not found.` };
      } catch (searchError: unknown) {
        console.error(`Error searching for handle "${handle}":`, searchError);
        if (searchError instanceof Error) return { error: `Error resolving handle "${handle}": ${searchError.message}`};
        return { error: `Unknown error resolving handle "${handle}"`};
      }
    } else if (url.startsWith('UC') && url.length === 24) {
      return { id: url };
    }
    return { error: 'Input does not match direct identifier patterns (URL, @handle, UCID). Consider searching by channel name.' };
  } catch (e: unknown) {
    console.warn('[extractChannelIdentifier] Unexpected error processing input:', e instanceof Error ? e.message : String(e), "Input:", url);
    return { error: 'Unexpected error during input processing. Input might be an invalid URL or format.' };
  }
}

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

interface ChannelStatsLogToSave {
    channel_id: string;
    created_at: string;
    subscriber_count?: number | null;
    video_count?: number | null;
    total_view_count?: number | null;
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

interface SupabaseErrorDetail {
  message: string;
  details?: string | null;
  hint?: string | null;
  code?: string | null;
}

// Google APIエラーレスポンスのネストされたエラーオブジェクトの型 (より具体的に)
interface GoogleApiErrorItem {
    message: string;
    domain?: string;
    reason?: string;
    // 他にもあれば追加
}
interface GoogleApiErrorData {
    code?: number;
    message?: string;
    errors?: GoogleApiErrorItem[];
    // 他にもあれば追加
}


export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { channelInput, userId, isPublicDemo } = body;

    if (!channelInput || typeof channelInput !== 'string' || channelInput.trim() === '') {
      return NextResponse.json({ message: 'Channel input is required', error: 'Input required' }, { status: 400 });
    }

    let identifier: { id?: string; forUsername?: string; error?: string };
    let identifiedByMethod: 'direct' | 'search_by_name' | 'none' = 'none';

    identifier = await extractChannelIdentifier(channelInput);

    if (identifier && !identifier.error && (identifier.id || identifier.forUsername)) {
        identifiedByMethod = 'direct';
        console.log(`[API getChannelInfo] Identified by direct extraction:`, identifier);
    } else {
        console.log(`[API getChannelInfo] Direct extraction failed or no specific identifier (Reason: ${identifier?.error}). Attempting search by name for: "${channelInput}"`);
        try {
            const searchByNameResponse: GaxiosResponse<youtube_v3.Schema$SearchListResponse> =
                await youtube.search.list({
                    part: ['snippet'], q: channelInput, type: ['channel'], maxResults: 1,
                });
            if (searchByNameResponse.data.items?.[0]?.id?.channelId) {
                identifier = { id: searchByNameResponse.data.items[0].id.channelId };
                identifiedByMethod = 'search_by_name';
                console.log(`[API getChannelInfo] Identified by search_by_name:`, identifier);
            } else {
                console.log(`[API getChannelInfo] No channel found by search_by_name for: "${channelInput}"`);
                return NextResponse.json({ message: `No channel found matching input: "${channelInput}"` }, { status: 404 });
            }
        } catch (searchError: unknown) {
            const errMsg = searchError instanceof Error ? searchError.message : 'Unknown search error';
            console.error(`[API getChannelInfo] Error during Youtube for name "${channelInput}":`, searchError);
            return NextResponse.json({ message: `Error searching for channel: ${channelInput}`, error: errMsg }, { status: 500 });
        }
    }
    
    if (!identifier || (!identifier.id && !identifier.forUsername)) {
        return NextResponse.json({ message: `Could not resolve a valid channel identifier from input: "${channelInput}"`}, { status: 400 });
    }

    const paramsForChannelList: youtube_v3.Params$Resource$Channels$List = {
        part: ['snippet', 'statistics', 'contentDetails', 'brandingSettings'],
        ...(identifier.id && { id: [identifier.id] }),
        ...(identifier.forUsername && { forUsername: identifier.forUsername }),
    };

    const youtubeResponse = await youtube.channels.list(paramsForChannelList);

    if (!youtubeResponse.data?.items || youtubeResponse.data.items.length === 0) {
      return NextResponse.json({ message: 'Channel not found on YouTube with the resolved identifier', error: 'Channel not found' }, { status: 404 });
    }
    const channelDataFromApi = youtubeResponse.data.items[0];
    if (!channelDataFromApi.id || !channelDataFromApi.snippet || !channelDataFromApi.statistics || !channelDataFromApi.contentDetails) {
        return NextResponse.json({ message: 'Incomplete data from YouTube API for the channel.' }, { status: 500 });
    }
    
    const snippet = channelDataFromApi.snippet;
    const statistics = channelDataFromApi.statistics;
    const contentDetails = channelDataFromApi.contentDetails;
    const nowISO = new Date().toISOString();

    const channelRecordToUpsert: ChannelDataToSave = {
      youtube_channel_id: channelDataFromApi.id,
      title: snippet.title,
      description: snippet.description,
      published_at: snippet.publishedAt,
      thumbnail_url: snippet.thumbnails?.high?.url || snippet.thumbnails?.default?.url,
      country: snippet.country,
      subscriber_count: statistics.subscriberCount ? parseInt(statistics.subscriberCount, 10) : null,
      video_count: statistics.videoCount ? parseInt(statistics.videoCount, 10) : null,
      total_view_count: statistics.viewCount ? parseInt(statistics.viewCount, 10) : null,
      uploads_playlist_id: contentDetails.relatedPlaylists?.uploads,
      custom_url: snippet.customUrl,
      handle: snippet.customUrl?.startsWith('@') ? snippet.customUrl : (snippet.title?.startsWith('@') ? snippet.title : null),
      last_fetched_at: nowISO,
      user_id: userId || null,
      is_public_demo: typeof isPublicDemo === 'boolean' ? isPublicDemo : false,
    };

    const { data: savedOrUpdatedChannel, error: upsertError } = await supabaseAdmin
      .from('channels')
      .upsert(channelRecordToUpsert, { onConflict: 'youtube_channel_id' })
      .select('id, youtube_channel_id').single();

    if (upsertError) {
      console.error('[API getChannelInfo] Supabase error upserting channel info:', upsertError);
      return NextResponse.json({ message: 'Error saving channel info to Supabase', error: upsertError.message, details: upsertError }, { status: 500 });
    }
    if (!savedOrUpdatedChannel || !savedOrUpdatedChannel.id) {
        console.error('[API getChannelInfo] No data or id returned after upserting channel, cannot log stats.');
        return NextResponse.json({ message: 'Channel data not saved or valid ID not returned from DB, cannot log stats.' }, { status: 500 });
    }
    
    const statsLogToInsert: ChannelStatsLogToSave = {
      channel_id: savedOrUpdatedChannel.id,
      created_at: nowISO,
      subscriber_count: statistics.subscriberCount ? parseInt(statistics.subscriberCount, 10) : null,
      video_count: statistics.videoCount ? parseInt(statistics.videoCount, 10) : null,
      total_view_count: statistics.viewCount ? parseInt(statistics.viewCount, 10) : null,
    };
    const { error: statsLogError } = await supabaseAdmin.from('channel_stats_logs').insert(statsLogToInsert);
    if (statsLogError) { console.error('[API getChannelInfo] Supabase error inserting channel stats log:', statsLogError); }

    console.log(`[API getChannelInfo] Channel info for ${savedOrUpdatedChannel.youtube_channel_id} saved/updated. Identified by: ${identifiedByMethod}. Stats log attempted.`);

    const extractedInfoForClient: ExtractedChannelInfoForClient = {
      channelId: channelDataFromApi.id,
      title: snippet.title,
      description: snippet.description,
      publishedAt: snippet.publishedAt,
      subscriberCount: statistics.subscriberCount,
      videoCount: statistics.videoCount,
      thumbnailUrl: snippet.thumbnails?.high?.url || snippet.thumbnails?.default?.url,
      totalViewCount: statistics.viewCount,
      uploadsPlaylistId: contentDetails.relatedPlaylists?.uploads,
    };

    return NextResponse.json({
      message: 'Successfully fetched and saved channel info and stats log',
      data: extractedInfoForClient,
    });

  } catch (error: unknown) {
    console.error('[API getChannelInfo] General error in POST handler:', error);
    let errorMessage = 'Failed to fetch channel info.';
    let errorDetails: SupabaseErrorDetail | string | null = null;

    // ★★★ この catch ブロックの型ガードを修正 ★★★
    if (error instanceof Error) {
      errorMessage = error.message;
      errorDetails = error.stack || error.message; // 基本はスタックかメッセージ

      // GaxiosError (Google APIクライアントのエラー) かどうかを判定
      // GaxiosError は 'response' プロパティを持ち、その中に詳細なエラー情報が含まれることがある
      if ('response' in error && error.response !== null && typeof error.response === 'object') {
        const gaxiosError = error as GaxiosError; // GaxiosErrorとして扱う
        if (
          gaxiosError.response &&
          gaxiosError.response.data &&
          typeof gaxiosError.response.data === 'object' &&
          gaxiosError.response.data !== null &&
          'error' in gaxiosError.response.data &&
          typeof (gaxiosError.response.data as { error?: unknown }).error === 'object' &&
          ((gaxiosError.response.data as { error?: unknown }).error) !== null &&
          'message' in (((gaxiosError.response.data as { error: object }).error) as object) &&
          typeof ((((gaxiosError.response.data as { error: object }).error) as { message?: unknown }).message) === 'string'
        ) {
          const apiErrorData = (gaxiosError.response.data as { error: GoogleApiErrorData }).error;
          if (apiErrorData && typeof apiErrorData.message === 'string') {
            errorMessage = `Google API Error: ${apiErrorData.message}`;
          }
          // errorDetails には gaxiosError.response.data 全体を入れることで、より多くの情報を提供
          errorDetails = gaxiosError.response.data as SupabaseErrorDetail; // 型アサーションは構造が似ている前提
        }
      } else if ( // SupabaseのPostgrestErrorかどうか (message, code, details, hint を持つ)
        typeof error.message === 'string' && // message は Error インスタンスなので存在する
        ('code' in error && typeof (error as { code?: unknown }).code === 'string')
        // details や hint はオプショナルなので、code の存在を重視
      ) {
        const pgError = error as Partial<SupabaseErrorDetail> & { message: string; code: string };
        errorMessage = `Database Error (${pgError.code}): ${pgError.message}`;
        errorDetails = {
            message: pgError.message,
            code: pgError.code,
            details: ('details' in pgError && typeof pgError.details === 'string') ? pgError.details : null,
            hint: ('hint' in pgError && typeof pgError.hint === 'string') ? pgError.hint : null,
        };
      }

    } else if (typeof error === 'string') {
      errorMessage = error;
      errorDetails = error;
    } else {
      errorMessage = 'An unknown error occurred.';
      errorDetails = 'The error object was not an instance of Error, a GaxiosError, a PostgrestError, or a string.';
    }

    return NextResponse.json(
      { message: errorMessage, error: errorMessage, details: errorDetails },
      { status: 500 }
    );
  }
}