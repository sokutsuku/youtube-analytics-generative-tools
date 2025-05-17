// next.config.ts

/** @type {import('next').NextConfig} */
const nextConfig = {
  // 他に既存の設定があれば、それはそのまま残してください
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'i.ytimg.com', // YouTubeの動画サムネイル用
        // port: '', // 通常は不要
        // pathname: '/vi/**', // 必要に応じてパスのパターンも指定可能
      },
      {
        protocol: 'https',
        hostname: 'yt3.ggpht.com', // YouTubeのチャンネルアイコン用
        // port: '',
        // pathname: '/**', // 必要に応じて
      },
      // 他にも外部ドメインの画像を使用する場合はここに追加
    ],
    // もし古いNext.jsバージョンで domains を使っていた場合の名残があれば、
    // remotePatterns に移行することを検討してください。
    // domains: ['i.ytimg.com', 'yt3.ggpht.com'], // ← 古い形式
  },
  // 他のNext.jsの設定があればここに追加
  // 例: reactStrictMode: true,
};

export default nextConfig;