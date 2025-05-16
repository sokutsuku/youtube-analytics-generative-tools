// src/app/api/getVideoInfo/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { google, youtube_v3 } from 'googleapis';

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

  } catch (error: unknown) {
    console.error('Error in POST /api/getVideoInfo:', error);
    let errorMessage = 'Failed to fetch video info.';
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
      errorMessage = 'An unknown error occurred while fetching video info.';
    }

    return NextResponse.json(
      { message: errorMessage, error: errorMessage, details: errorDetails },
      { status: 500 }
    );
  }
}