// src/app/api/getChannelInfo/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { google, youtube_v3 } from 'googleapis';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

const youtube = google.youtube({
  version: 'v3',
  auth: process.env.YOUTUBE_API_KEY,
});

// チャンネルURL/ハンドルからIDやユーザー名を抽出する関数 (前回までのものをベース)
async function extractDirectIdentifier(inputValue: string): Promise<{ id?: string; forUsername?: string; error?: string }> {
  try {
    // URL形式のチェック
    if (inputValue.includes('/') || inputValue.includes('.')) { // URLである可能性が高い
        const urlObj = new URL(inputValue.startsWith('http') ? inputValue : `http://${inputValue}`); // httpがない場合補完
        const pathParts = urlObj.pathname.split('/').filter(part => part.length > 0);

        if (pathParts.length > 0) {
        if (pathParts[0] === 'channel' && pathParts[1] && pathParts[1].startsWith('UC') && pathParts[1].length === 24) {
            return { id: pathParts[1] };
        }
        if (pathParts[0] === 'user' && pathParts[1]) {
            return { forUsername: pathParts[1] };
        }
        // URLの最後の部分が@ハンドルかチェック
        const lastPart = pathParts[pathParts.length - 1];
        if (lastPart.startsWith('@') && lastPart.length > 1) {
            const handle = lastPart;
            // ハンドルからチャンネルIDを検索
            const searchResponse = await youtube.search.list({ part: ['snippet'], q: handle, type: ['channel'], maxResults: 1 });
            if (searchResponse.data.items && searchResponse.data.items.length > 0 && searchResponse.data.items[0].id?.channelId) {
            return { id: searchResponse.data.items[0].id.channelId };
            } else {
            return { error: `Handle "${handle}" (from URL path) not found or not a channel.` };
            }
        }
        // URLだが標準形式でない場合、最後のパスをforUsernameとして試す (リスクあり)
        if (pathParts.length > 0) {
             console.log(`[extractDirectIdentifier] URL fallback to forUsername: ${pathParts[pathParts.length -1]}`);
             return { forUsername: pathParts[pathParts.length -1] };
        }
        }
    } else if (inputValue.startsWith('@') && inputValue.length > 1) { // @ハンドル単体の場合
        const handle = inputValue;
        const searchResponse = await youtube.search.list({ part: ['snippet'], q: handle, type: ['channel'], maxResults: 1 });
        if (searchResponse.data.items && searchResponse.data.items.length > 0 && searchResponse.data.items[0].id?.channelId) {
        return { id: searchResponse.data.items[0].id.channelId };
        } else {
        return { error: `Handle "${handle}" not found or not a channel.` };
        }
    }
    // URL形式でも@ハンドルでもない場合は、この関数では解決できない
    return { error: 'Input is not a standard channel URL or handle format for direct extraction.' };

  } catch (e: unknown) {
    // URLパースエラーなどもここに含まれる
    console.warn('[extractDirectIdentifier] Error parsing input as URL or during handle search:', e instanceof Error ? e.message : String(e));
    return { error: 'Could not determine identifier from input using direct extraction methods.' };
  }
}

// Supabaseのchannelsテーブルの型
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
  handle?: string | null; // APIから取得できるハンドル名 (snippet.customUrl が@で始まる場合など)
  last_fetched_at: string;
  user_id?: string | null;
  is_public_demo?: boolean;
}

// channel_stats_logs テーブルの型
interface ChannelStatsLogToSave {
    channel_id: string; // Supabaseのchannelsテーブルのid (uuid)
    created_at: string;
    subscriber_count?: number | null;
    video_count?: number | null;
    total_view_count?: number | null;
}

// フロントエンドに返す情報の型
interface ExtractedChannelInfoForClient {
  channelId: string; // youtube_channel_id
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
    const { channelInput, userId, isPublicDemo } = body; // フロントからは channelInput で受け取る

    if (!channelInput || typeof channelInput !== 'string' || channelInput.trim() === '') {
      return NextResponse.json(
        { message: 'Channel input (URL, name, or @handle) is required', error: 'Input required' },
        { status: 400 }
      );
    }

    let identifier: { id?: string; forUsername?: string; error?: string } = {};
    let identifiedByMethod: 'direct' | 'search_by_name' | 'none' = 'none';

    // 1. まずURL形式や@ハンドル形式での直接的な識別子抽出を試みる
    const directIdentifierResult = await extractDirectIdentifier(channelInput);

    if (directIdentifierResult && !directIdentifierResult.error && (directIdentifierResult.id || directIdentifierResult.forUsername)) {
        identifier = directIdentifierResult;
        identifiedByMethod = 'direct';
        console.log(`[API getChannelInfo] Identified by direct extraction:`, identifier);
    } else {
        // 2. 直接抽出できなかった場合、チャンネル名としてYoutube APIで検索
        console.log(`[API getChannelInfo] Direct extraction failed or no identifier found. Attempting search by name for: "${channelInput}"`);
        try {
            const searchResponse = await youtube.search.list({
                part: ['snippet'],
                q: channelInput, // 入力文字列をチャンネル名として検索
                type: ['channel'],
                maxResults: 1, // 最も関連性の高いものを1つ取得
            });

            if (searchResponse.data.items && searchResponse.data.items.length > 0 && searchResponse.data.items[0].id?.channelId) {
                identifier = { id: searchResponse.data.items[0].id.channelId };
                identifiedByMethod = 'search_by_name';
                console.log(`[API getChannelInfo] Identified by search_by_name:`, identifier);
            } else {
                console.log(`[API getChannelInfo] No channel found by search_by_name for: "${channelInput}"`);
                return NextResponse.json({ message: `No channel found matching input: "${channelInput}"` }, { status: 404 });
            }
        } catch (searchError: unknown) {
            console.error(`[API getChannelInfo] Error during Youtube for name "${channelInput}":`, searchError);
            const errMsg = searchError instanceof Error ? searchError.message : 'Unknown search error';
            return NextResponse.json({ message: 'Error searching for channel on YouTube', error: errMsg }, { status: 500 });
        }
    }
    
    // 識別子が確定していなければエラー
    if (!identifier || (!identifier.id && !identifier.forUsername)) {
        return NextResponse.json({ message: `Could not resolve a valid channel identifier from input: "${channelInput}"`}, { status: 400 });
    }

    // 3. チャンネル詳細情報を取得
    const params: youtube_v3.Params$Resource$Channels$List = {
        part: ['snippet', 'statistics', 'contentDetails', 'brandingSettings'],
        ...(identifier.id && { id: [identifier.id] }),
        ...(identifier.forUsername && { forUsername: identifier.forUsername }),
    };

    const youtubeResponse = await youtube.channels.list(params);

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

    // 4. Supabaseに保存するためのデータ整形
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
      handle: snippet.customUrl?.startsWith('@') ? snippet.customUrl : (snippet.title?.startsWith('@') ? snippet.title : null), // よりハンドルらしいものを探す試み
      last_fetched_at: nowISO,
      user_id: userId || null,
      is_public_demo: typeof isPublicDemo === 'boolean' ? isPublicDemo : false,
    };

    // 5. SupabaseのchannelsテーブルにUpsert
    const { data: savedOrUpdatedChannel, error: upsertError } = await supabaseAdmin
      .from('channels')
      .upsert(channelRecordToUpsert, { onConflict: 'youtube_channel_id' })
      .select('id, youtube_channel_id') // 内部IDとyoutube_channel_idを返す
      .single();

    if (upsertError) {
      console.error('[API getChannelInfo] Supabase error upserting channel info:', upsertError);
      return NextResponse.json({ message: 'Error saving channel info to Supabase', error: upsertError.message }, { status: 500 });
    }
    if (!savedOrUpdatedChannel) {
        console.error('[API getChannelInfo] No data returned after upserting channel, cannot log stats.');
        return NextResponse.json({ message: 'Channel data not saved or returned from DB, cannot log stats.' }, { status: 500 });
    }
    
    // 6. Supabaseのchannel_stats_logsテーブルにINSERT
    const statsLogToInsert: ChannelStatsLogToSave = {
      channel_id: savedOrUpdatedChannel.id, // channelsテーブルの内部ID (uuid)
      created_at: nowISO,
      subscriber_count: statistics.subscriberCount ? parseInt(statistics.subscriberCount, 10) : null,
      video_count: statistics.videoCount ? parseInt(statistics.videoCount, 10) : null,
      total_view_count: statistics.viewCount ? parseInt(statistics.viewCount, 10) : null,
    };
    const { error: statsLogError } = await supabaseAdmin.from('channel_stats_logs').insert(statsLogToInsert);
    if (statsLogError) { console.error('[API getChannelInfo] Supabase error inserting channel stats log:', statsLogError); }

    console.log(`[API getChannelInfo] Channel info for ${savedOrUpdatedChannel.youtube_channel_id} saved/updated. Identified by: ${identifiedByMethod}. Stats log attempted.`);

    // 7. フロントエンドに返すデータ
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
    // ... (既存の堅牢なエラーハンドリングは維持) ...
    let errorMessage = 'Failed to fetch channel info.';
    let errorDetails: unknown = 'Unknown error details';
    if (error instanceof Error) {
      errorMessage = error.message; 
      errorDetails = error.stack || error.message;
      if (typeof error === 'object' && error !== null && 'response' in error && error.response && typeof (error.response as any).data?.error?.message === 'string'){
        errorMessage = `Google API Error: ${(error.response as any).data.error.message}`;
        errorDetails = (error.response as any).data;
      }
    } else if (typeof error === 'string'){
        errorMessage = error;
        errorDetails = error;
    }
    return NextResponse.json(
      { message: errorMessage, error: errorMessage, details: errorDetails },
      { status: 500 }
    );
  }
}