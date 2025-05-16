// src/app/api/getVideoInfo/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis'; // youtube_v3 はこのファイルでは直接使っていないのでインポート不要

// YouTube API クライアントの初期化 (変更なし)
const youtube = google.youtube({
  version: 'v3',
  auth: process.env.YOUTUBE_API_KEY, // .env.local または Vercelの環境変数から読み込み
});

// YouTubeのURLから動画IDを抽出するヘルパー関数
// (catchブロックの型を修正)
function extractVideoId(url: string): string | null {
  try {
    const urlObj = new URL(url);
    // (既存のロジックはそのまま)
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
  } catch (error: unknown) { // any を unknown に変更
    console.error('Invalid URL:', error);
    // エラーメッセージを返す場合は、Errorインスタンスか確認
    // if (error instanceof Error) { console.error(error.message); }
    return null;
  }
}

// APIレスポンスの型定義 (変更なし)
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
      part: ['snippet'], // statistics など他の情報も必要なら追加
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

  } catch (error: unknown) { // ★★★ ここを修正: any を unknown に変更 ★★★
    console.error('Error in POST /api/getVideoInfo:', error);
    let errorMessage = 'Failed to fetch video info.';
    // エラー詳細の初期化 (toString() で文字列化できることを期待)
    let errorDetails: any = error instanceof Error ? error.message : String(error);

    if (error instanceof Error) {
      // googleapis (gaxios) のエラーレスポンス構造を考慮
      // (error as any) は型安全ではないが、特定の構造にアクセスするために一時的に使用
      const gaxiosError = error as any;
      if (gaxiosError.response?.data?.error?.message) {
        errorMessage = `Google API Error: ${gaxiosError.response.data.error.message}`;
        errorDetails = gaxiosError.response.data; // より詳細なエラーオブジェクト
      } else {
        errorMessage = error.message; // 通常のErrorオブジェクトのメッセージ
      }
    } else {
      // Errorインスタンスではない未知のエラー
      errorMessage = 'An unknown error occurred while fetching video info.';
    }

    // エラーレスポンス
    return NextResponse.json(
      { message: errorMessage, error: errorMessage, details: errorDetails },
      { status: 500 }
    );
  }
}