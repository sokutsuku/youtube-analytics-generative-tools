// src/components/sections/ClientChannelRegistrationForm.tsx
'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';

// 型定義
interface ChannelInfo {
  channelId: string;
  title?: string | null;
  // 必要であればAPIルートが返す他のプロパティも追加
}

// ★★★ Supabaseのエラー詳細の型を定義 (APIルート側と共通化推奨) ★★★
interface SupabaseErrorDetailForClient {
  message: string;
  details?: string | null;
  hint?: string | null;
  code?: string | null;
}

interface ChannelApiResponse {
  message: string;
  data?: ChannelInfo;
  error?: string;
  details?: SupabaseErrorDetailForClient | string | null; // ★★★ any を修正 ★★★
}

// ヘルパー関数 (もしこのファイルで必要なら定義、通常はutilsなどからインポート)
// const formatDate = (...) // このファイルでは未使用なので削除済み
// const formatCount = (...) // このファイルでは未使用なので削除済み

export default function ClientChannelRegistrationForm() {
  const router = useRouter();

  const [youtubeChannelUrl, setYoutubeChannelUrl] = useState<string>('');
  const [isFetchingAndSaving, setIsFetchingAndSaving] = useState<boolean>(false);
  const [fetchSaveError, setFetchSaveError] = useState<string>('');
  const [lastAddedChannelInfo, setLastAddedChannelInfo] = useState<ChannelInfo | null>(null);

  const handleAddChannelSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsFetchingAndSaving(true);
    setFetchSaveError('');
    setLastAddedChannelInfo(null);

    try {
      const response = await fetch('/api/getChannelInfo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channelUrl: youtubeChannelUrl,
          // is_public_demo: true, // 必要に応じて
          // userId: 'some_user_id', // 必要に応じて
        }),
      });

      const result: ChannelApiResponse = await response.json();

      if (!response.ok) { // まずHTTPステータスコードでエラーを判断
        // エラーレスポンスの message または error プロパティを優先して使用
        const errorMessage = result.error || result.message || `チャンネル情報の登録/更新に失敗しました (ステータス: ${response.status})。`;
        throw new Error(errorMessage);
      }

      // response.ok だが、APIがカスタムエラーを返している場合 (result.error が存在するなど)
      if (result.error) {
        throw new Error(result.error);
      }

      if (result.data && result.data.channelId) {
        setLastAddedChannelInfo(result.data);
        setYoutubeChannelUrl('');
        alert(`チャンネル「${result.data.title || result.data.channelId}」を登録/更新しました。上のリストが更新されます。`);
        router.refresh();
      } else {
        throw new Error('チャンネル情報の登録後、有効なデータまたはチャンネルIDが返されませんでした。');
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        setFetchSaveError(err.message);
      } else {
        setFetchSaveError('チャンネル情報の登録中に不明なエラーが発生しました。');
      }
    } finally {
      setIsFetchingAndSaving(false);
    }
  };

  return (
    <section className="bg-white shadow-xl rounded-lg p-6 md:p-8 w-full max-w-3xl">
      <h1 className="text-2xl md:text-3xl font-bold text-sky-800 mb-8 text-center">
        新しいYouTubeチャンネルを登録/情報更新
      </h1>
      <form onSubmit={handleAddChannelSubmit} className="space-y-6">
        <div>
          <label htmlFor="youtubeChannelUrlToAdd" className="block text-sm font-medium text-gray-700 mb-1">
            登録/更新したいYouTubeチャンネルのURL:
          </label>
          <input
            type="url" id="youtubeChannelUrlToAdd" name="youtubeChannelUrlToAdd"
            value={youtubeChannelUrl} onChange={(e) => setYoutubeChannelUrl(e.target.value)}
            placeholder="例: www.youtube.com0/@YourFavoriteChannel" required
            className="mt-1 block w-full px-4 py-3 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-sky-500 focus:border-sky-500 sm:text-sm transition-shadow"
          />
        </div>
        <button type="submit" disabled={isFetchingAndSaving}
          className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-sky-600 hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sky-500 disabled:bg-gray-400">
          {isFetchingAndSaving ? '処理中...' : 'このチャンネルを登録 / 情報更新'}
        </button>
      </form>
      {fetchSaveError && (
        <div role="alert" className="mt-6 bg-red-50 border-l-4 border-red-400 text-red-700 p-4 rounded-md">
          <p className="font-bold">エラー:</p><p>{fetchSaveError}</p>
        </div>
      )}
      {lastAddedChannelInfo && !fetchSaveError && (
        <div className="mt-6 p-4 border border-green-300 rounded-lg bg-green-50 text-green-700">
          <p className="font-semibold">
            チャンネル「{lastAddedChannelInfo.title || lastAddedChannelInfo.channelId}」を登録/更新しました。
          </p>
          <p className="text-sm">
            上の「登録済みチャンネル一覧」が更新されています。
          </p>
        </div>
      )}
    </section>
  );
}