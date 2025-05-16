// src/app/api/getVideoInfo/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';

// YouTube API クライアントの初期化 (変更なし)
const youtube = google.youtube({
  version: 'v3',
  auth: process.env.YOUTUBE_API_KEY, // .env.local または Vercelの環境変数から読み込み
});

// YouTubeのURLから動画IDを抽出するヘルパー関数 (前回提示したものを再利用または改善)
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
  } catch (error) {
    console.error('Invalid URL:', error);
    return null;
  }
}

// APIレスポンスの型定義
interface VideoSnippet {
  title?: string | null;
  description?: string | null;
  thumbnails?: {
    default?: { url?: string | null };
    medium?: { url?: string | null };
    high?: { url?: string | null };
  } | null;
}

interface ExtractedInfo {
  youtube_video_id: string;
  title?: string | null;
  description?: string | null;
  thumbnail_url?: string | null;
}

// POSTメソッドのハンドラ関数
export async function POST(request: NextRequest) {
  try {
    // リクエストボディをJSONとしてパース
    const body = await request.json();
    const { youtubeUrl } = body;

    if (!youtubeUrl || typeof youtubeUrl !== 'string') {
      return NextResponse.json(
        { message: 'YouTube URL is required and must be a string', error: 'YouTube URL is required' },
        { status: 400 }
      );
    }

    const videoId = extractVideoId(youtubeUrl);

    if (!videoId) {
      return NextResponse.json(
        { message: 'Invalid YouTube URL or unable to extract video ID', error: 'Invalid YouTube URL' },
        { status: 400 }
      );
    }

    // YouTube APIから動画情報を取得
    const youtubeResponse = await youtube.videos.list({
      part: ['snippet'],
      id: [videoId],
    });

    if (!youtubeResponse.data.items || youtubeResponse.data.items.length === 0) {
      return NextResponse.json(
        { message: 'Video not found on YouTube', error: 'Video not found' },
        { status: 404 }
      );
    }

    const videoData = youtubeResponse.data.items[0];
    const snippet: VideoSnippet | undefined | null = videoData.snippet;

    const extractedInfo: ExtractedInfo = {
      youtube_video_id: videoId,
      title: snippet?.title,
      description: snippet?.description,
      thumbnail_url: snippet?.thumbnails?.high?.url || snippet?.thumbnails?.default?.url,
    };

    // 成功レスポンス
    return NextResponse.json({
      message: 'Successfully fetched video info',
      data: extractedInfo,
    });

  } catch (error: any) {
    console.error('Error in POST /api/getVideoInfo:', error);
    let errorMessage = 'Failed to fetch video info.';
    if (error.response && error.response.data && error.response.data.error && error.response.data.error.message) {
        errorMessage = `Google API Error: ${error.response.data.error.message}`;
    } else if (error.message) {
        errorMessage = error.message;
    }
    // エラーレスポンス
    return NextResponse.json(
      { message: errorMessage, error: errorMessage, details: error?.response?.data || error.toString() },
      { status: 500 }
    );
  }
}