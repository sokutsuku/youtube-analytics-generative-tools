// src/app/api/getVideoStatsLog/[supabaseVideoId]/route.ts
import { NextResponse, NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

interface VideoStatLog {
  fetched_at: string;
  view_count?: number | null;
  like_count?: number | null;
  comment_count?: number | null;
}

export async function GET(request: NextRequest) {
  // URLからsupabaseVideoIdを抽出
  const url = new URL(request.url);
  const pathParts = url.pathname.split('/');
  const supabaseVideoId = pathParts[pathParts.length - 1];

  if (!supabaseVideoId) {
    return NextResponse.json({ error: 'Supabase Video ID is required' }, { status: 400 });
  }

  try {
    const { data: statsLogData, error: statsLogError } = await supabaseAdmin
      .from('video_stats_logs')
      .select('fetched_at, view_count, like_count, comment_count')
      .eq('video_id', supabaseVideoId)
      .order('fetched_at', { ascending: true });

    if (statsLogError) throw statsLogError;

    return NextResponse.json(statsLogData as VideoStatLog[] || []);
  } catch (error: unknown) {
    console.error('Error fetching video stats log:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ error: 'Failed to fetch video stats log', details: errorMessage }, { status: 500 });
  }
}