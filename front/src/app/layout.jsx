import '../styles/globals.css';

export const metadata = {
  title: '미래 자아 생성기 | Future Self Generator',
  description: '당신의 얼굴 사진과 성격 설문을 분석하여 30년 후 미래의 당신의 모습과 삶을 예측해드립니다.',
  openGraph: {
    title: '미래 자아 생성기 | Future Self Generator',
    description: '당신의 미래 모습은 어떨까요? 지금 바로 확인해보세요!',
    type: 'website',
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
        <link rel="icon" href="/favicon.ico" />
      </head>
      <body>
        <main>{children}</main>
      </body>
    </html>
  );
}
