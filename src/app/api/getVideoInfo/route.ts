// src/app/api/getVideoInfo/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { google, youtube_v3 } from 'googleapis'; // youtube_v3 をインポート (paramsの型で使用)

const youtube = google.youtube({
  version: 'v3',
  auth: process.env.YOUTUBE_API_KEY,
});

function extractVideoId(url: string): string | null {
  try {
    const urlObj = new URL(url);
    if (urlObj.hostname === 'youtu.be') {
      return urlObj.pathname.slice(1);
    }
    if (urlObj.hostname.includes('youtube.com')) {
      if (urlObj.pathname === '/watch') {
        return urlObj.searchParams.get('v');
      }
      if (urlObj.pathname.startsWith('/embed/')) {
        return urlObj.pathname.split('/')[2];
      }
      if (urlObj.pathname.startsWith('/shorts/')) {
        return urlObj.pathname.split('/')[2];
      }
    }
    return null;
  } catch (error: unknown) {
    console.error('Invalid URL:', error);
    return null;
  }
}

interface VideoSnippet {
  title?: string | null;
  description?: string | null;
  publishedAt?: string | null;
  thumbnails?: {
    default?: { url?: string | null };
    medium?: { url?: string | null };
    high?: { url?: string | null };
  } | null;
}

interface VideoStatistics {
  viewCount?: string | null;
  likeCount?: string | null;
  commentCount?: string | null;
}

interface ExtractedVideoInfo {
  videoId: string;
  title?: string | null;
  description?: string | null;
  publishedAt?: string | null;
  viewCount?: string | null;
  likeCount?: string | null;
  commentCount?: string | null;
  thumbnailUrl?: string | null;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { youtubeUrl } = body;

    if (!youtubeUrl || typeof youtubeUrl !== 'string') {
      return NextResponse.json(
        { message: 'YouTube URL is required', error: 'YouTube URL is required' },
        { status: 400 }
      );
    }

    const videoId = extractVideoId(youtubeUrl);

    if (!videoId) {
      return NextResponse.json(
        { message: 'Invalid YouTube URL: Missing video ID', error: 'Invalid YouTube URL' },
        { status: 400 }
      );
    }

    const params: youtube_v3.Params$Resource$Videos$List = {
      part: ['snippet', 'statistics'],
      id: [videoId],
    };

    const youtubeResponse = await youtube.videos.list(params);

    if (!youtubeResponse.data.items || youtubeResponse.data.items.length === 0) {
      return NextResponse.json(
        { message: 'Video not found on YouTube', error: 'Video not found' },
        { status: 404 }
      );
    }

    const videoData = youtubeResponse.data.items[0];
    const snippet: VideoSnippet | undefined | null = videoData.snippet;
    const statistics: VideoStatistics | undefined | null = videoData.statistics;

    const extractedInfo: ExtractedVideoInfo = {
      videoId: videoData.id || 'N/A',
      title: snippet?.title,
      description: snippet?.description,
      publishedAt: snippet?.publishedAt,
      viewCount: statistics?.viewCount,
      likeCount: statistics?.likeCount,
      commentCount: statistics?.commentCount,
      thumbnailUrl: snippet?.thumbnails?.high?.url || snippet?.thumbnails?.default?.url,
    };

    return NextResponse.json({
      message: 'Successfully fetched video info',
      data: extractedInfo,
    });

  } catch (error: unknown) { // catchの型を unknown に
    console.error('Error in POST /api/getVideoInfo:', error);
    let errorMessage = 'Failed to fetch video info.';
    let errorDetails: unknown = 'Unknown error details'; // 初期値を設定

    if (error instanceof Error) {
      errorMessage = error.message; // まずは基本的なエラーメッセージを設定
      errorDetails = error.stack || error.message; // スタックトレースかメッセージを詳細として設定

      // GaxiosErrorのような構造を持つかチェック (より安全に)
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
        // 型アサーションの前に十分なチェックを行う
        // ここでは error.response.data.error がオブジェクトで message プロパティを持つことが保証されている
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