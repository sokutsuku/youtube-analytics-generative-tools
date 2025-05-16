// src/app/api/getChannelInfo/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { google, youtube_v3 } from 'googleapis'; // youtube_v3をインポート

const youtube = google.youtube({
  version: 'v3',
  auth: process.env.YOUTUBE_API_KEY,
});

// チャンネルURLからID、ユーザー名、またはハンドルを抽出する関数
// (ユーザー提供のコードをベースに、catchブロックの型を修正)
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
            type: ['channel'], // ★★★ 修正: 文字列から文字列の配列へ ★★★
            maxResults: 1,
          });
          // searchResponse.data が存在するか確認
          if (searchResponse && searchResponse.data && searchResponse.data.items && searchResponse.data.items.length > 0 && searchResponse.data.items[0].id?.channelId) {
            return { id: searchResponse.data.items[0].id.channelId };
          } else {
            return { error: `Handle "${handle}" not found or not a channel.` };
          }
        } catch (searchError: unknown) { // catchのエラー型をunknownに
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
            type: ['channel'], // ★★★ 修正: 文字列から文字列の配列へ ★★★
            maxResults: 1,
          });
          // searchResponse.data が存在するか確認
          if (searchResponse && searchResponse.data && searchResponse.data.items && searchResponse.data.items.length > 0 && searchResponse.data.items[0].id?.channelId) {
            return { id: searchResponse.data.items[0].id.channelId };
          }
          // ここではエラーを返さず、次のforUsernameのフォールバックがあるため、そのまま進む
        } catch (searchError: unknown) { // catchのエラー型をunknownに
            console.error(`Error searching for handle (last part) "${handle}":`, searchError);
            // エラーがあっても次のforUsernameの処理に進むため、ここではエラーオブジェクトを返さない
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

// APIレスポンスの型定義 (変更なし)
interface ChannelSnippet {
  title?: string | null;
  description?: string | null;
  publishedAt?: string | null;
  thumbnails?: {
    default?: { url?: string | null };
    medium?: { url?: string | null };
    high?: { url?: string | null };
  } | null;
}

interface ChannelStatistics {
  subscriberCount?: string | null;
  videoCount?: string | null;
  viewCount?: string | null;
}

interface ExtractedChannelInfo {
  channelId: string;
  title?: string | null;
  description?: string | null;
  publishedAt?: string | null;
  subscriberCount?: string | null;
  videoCount?: string | null;
  thumbnailUrl?: string | null;
  totalViewCount?: string | null;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { channelUrl } = body;

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

    // Error 3: params を const で宣言し、初期化時に条件を反映
    const params: youtube_v3.Params$Resource$Channels$List = {
        part: ['snippet', 'statistics'],
        // スプレッド構文を使って条件に応じてプロパティを追加
        ...(identifier.id && { id: [identifier.id] }),
        ...(identifier.forUsername && { forUsername: identifier.forUsername }),
    };

    // identifier.id も identifier.forUsername もない場合はエラー
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
    const snippet: ChannelSnippet | undefined | null = channelData.snippet;
    const statistics: ChannelStatistics | undefined | null = channelData.statistics;

    const extractedInfo: ExtractedChannelInfo = {
      channelId: channelData.id || 'N/A',
      title: snippet?.title,
      description: snippet?.description,
      publishedAt: snippet?.publishedAt,
      subscriberCount: statistics?.subscriberCount,
      videoCount: statistics?.videoCount,
      thumbnailUrl: snippet?.thumbnails?.high?.url || snippet?.thumbnails?.default?.url,
      totalViewCount: statistics?.viewCount,
    };

    return NextResponse.json({
      message: 'Successfully fetched channel info',
      data: extractedInfo,
    });

  } catch (error: unknown) { // Error 4: any を unknown に変更
    console.error('Error in POST /api/getChannelInfo:', error);
    let errorMessage = 'Failed to fetch channel info.';
    let errorDetails: unknown = error instanceof Error ? error.message : String(error);

    if (error instanceof Error) {
      const gaxiosError = error as unknown;
      if (
        typeof gaxiosError === 'object' &&
        gaxiosError !== null &&
        'response' in gaxiosError &&
        typeof (gaxiosError as any).response?.data?.error?.message === 'string'
      ) {
        errorMessage = `Google API Error: ${(gaxiosError as any).response.data.error.message}`;
        errorDetails = (gaxiosError as any).response.data;
      } else {
        errorMessage = error.message;
      }
    } else {
      errorMessage = 'An unknown error occurred while fetching channel info.';
    }

    return NextResponse.json(
      { message: errorMessage, error: errorMessage, details: errorDetails },
      { status: 500 }
    );
  }
}