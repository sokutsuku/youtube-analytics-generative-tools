// src/app/api/getChannelInfo/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { google, youtube_v3 } from 'googleapis'; // youtube_v3をインポート

const youtube = google.youtube({
  version: 'v3',
  auth: process.env.YOUTUBE_API_KEY,
});

// チャンネルURLからID、ユーザー名、またはハンドルを抽出する関数
// チャンネルURLからID、ユーザー名、またはハンドルを抽出する関数
async function extractChannelIdentifier(url: string): Promise<{ id?: string; forUsername?: string; handle?: string; error?: string }> {
  try {
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split('/').filter(part => part.length > 0);

    if (pathParts.length > 0) {
      if (pathParts[0] === 'channel' && pathParts[1]) {
        if (pathParts[1].startsWith('UC') && pathParts[1].length === 24) { // 標準的なチャンネルID形式
            return { id: pathParts[1] };
        }
      }
      if (pathParts[0] === 'user' && pathParts[1]) {
        return { forUsername: pathParts[1] };
      }
      if (pathParts[0].startsWith('@') && pathParts[0].length > 1) {
        // ハンドル名の場合は、Search APIでチャンネルIDを検索する必要がある
        const handle = pathParts[0];
        try {
          // ★★★ 修正点 ★★★
          const searchResponse = await youtube.search.list({ // 'Youtube.list' から 'Youtube.list' に修正
            part: ['snippet'],
            q: handle, // ハンドル名をクエリとして使用
            type: ['channel'], // チャンネルのみを検索
            maxResults: 1,
          });
          if (searchResponse.data.items && searchResponse.data.items.length > 0 && searchResponse.data.items[0].id?.channelId) {
            return { id: searchResponse.data.items[0].id.channelId };
          } else {
            return { error: `Handle "${handle}" not found or not a channel.` };
          }
        } catch (searchError: any) {
          console.error('Error searching for handle:', searchError);
          return { error: `Error resolving handle "${handle}": ${searchError.message}` };
        }
      }
      const lastPart = pathParts[pathParts.length - 1];
      if (lastPart.startsWith('@')) {
        const handle = lastPart;
         try {
          // ★★★ 修正点 ★★★
          const searchResponse = await youtube.search.list({ // 'Youtube.list' から 'Youtube.list' に修正
            part: ['snippet'],
            q: handle,
            type: ['channel'],
            maxResults: 1,
          });
          if (searchResponse.data.items && searchResponse.data.items.length > 0 && searchResponse.data.items[0].id?.channelId) {
            return { id: searchResponse.data.items[0].id.channelId };
          }
        } catch (searchError) { /* 失敗しても次の判定へ */ }
      }
      return { forUsername: lastPart };
    }
    return { error: 'Could not determine channel identifier from URL.' };
  } catch (e) {
    console.error('Invalid Channel URL:', e);
    return { error: 'Invalid Channel URL format.' };
  }
}

// APIレスポンスの型定義
interface ChannelSnippet {
  title?: string | null;
  description?: string | null;
  publishedAt?: string | null; // チャンネルの作成日 (初回投稿日として利用)
  thumbnails?: {
    default?: { url?: string | null };
    medium?: { url?: string | null };
    high?: { url?: string | null };
  } | null;
}

interface ChannelStatistics {
  subscriberCount?: string | null;
  videoCount?: string | null;
  viewCount?: string | null; // 総再生回数も取得可能
}

interface ExtractedChannelInfo {
  channelId: string;
  title?: string | null;
  description?: string | null;
  publishedAt?: string | null;
  subscriberCount?: string | null;
  videoCount?: string | null;
  thumbnailUrl?: string | null;
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

    let params: youtube_v3.Params$Resource$Channels$List = {
        part: ['snippet', 'statistics'],
    };

    if (identifier.id) {
        params.id = [identifier.id];
    } else if (identifier.forUsername) {
        params.forUsername = identifier.forUsername;
    } else {
        // ハンドルの場合はextractChannelIdentifier内でIDに解決される想定
        // ここに来る場合は、IDもforUsernameもハンドル解決後のIDもない場合（基本的にはないはず）
        return NextResponse.json(
            { message: 'Could not determine channel ID or username from URL.', error: 'Identifier not found' },
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
      channelId: channelData.id || 'N/A', // 念のためIDも返す
      title: snippet?.title,
      description: snippet?.description,
      publishedAt: snippet?.publishedAt, // これを「初回投稿日」として扱う
      subscriberCount: statistics?.subscriberCount,
      videoCount: statistics?.videoCount,
      thumbnailUrl: snippet?.thumbnails?.high?.url || snippet?.thumbnails?.default?.url,
    };

    return NextResponse.json({
      message: 'Successfully fetched channel info',
      data: extractedInfo,
    });

  } catch (error: any) {
    console.error('Error in POST /api/getChannelInfo:', error);
    let errorMessage = 'Failed to fetch channel info.';
    if (error.response && error.response.data && error.response.data.error && error.response.data.error.message) {
      errorMessage = `Google API Error: ${error.response.data.error.message}`;
    } else if (error.message) {
      errorMessage = error.message;
    }
    return NextResponse.json(
      { message: errorMessage, error: errorMessage, details: error?.response?.data || error.toString() },
      { status: 500 }
    );
  }
}