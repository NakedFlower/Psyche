'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Home from '../components/home/Home';
import Upload from '../components/upload/Upload';
import Quiz from '../components/quiz/Quiz';
import { getPresignedUrl, uploadToS3, generateFutureSelf } from '../lib/api';
import { Sparkles, Loader2, RefreshCw } from 'lucide-react';
import './page.css';

const LOADING_STEPS = [
  "업로드된 이미지를 해독하는 중...",
  "얼굴의 윤곽 및 세월 흔적 알고리즘 가동 중...",
  "성격 설문 응답 기반 가치관 분석 중...",
  "30년 후 최적화된 미래 직업군 탐색 중...",
  "미래의 자아가 보내온 조언과 메시지 조율 중...",
  "초해상도 미래 얼굴 프로필 카드 렌더링 중..."
];

export default function MainPage() {
  const router = useRouter();
  const [step, setStep] = useState('hero'); // hero, upload, quiz, loading, error
  const [selectedImage, setSelectedImage] = useState(null);
  const [answers, setAnswers] = useState({});
  const [loadingTextIdx, setLoadingTextIdx] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');

  // Rotate loading captions every 1.5 seconds
  useEffect(() => {
    let interval;
    if (step === 'loading') {
      interval = setInterval(() => {
        setLoadingTextIdx((prev) => (prev + 1) % LOADING_STEPS.length);
      }, 1500);
    }
    return () => clearInterval(interval);
  }, [step]);

  const handleStart = () => {
    setStep('upload');
  };

  const handleUploadNext = () => {
    setStep('quiz');
  };

  const handleQuizBack = () => {
    setStep('upload');
  };

  const handleQuizFinish = async (quizAnswers) => {
    setAnswers(quizAnswers);
    setStep('loading');
    setErrorMsg('');

    try {
      // 1. S3 Presigned URL 발급
      const filename = selectedImage.name;
      const filetype = selectedImage.type;
      const { uploadUrl, s3Key } = await getPresignedUrl(filename, filetype);

      // 2. S3 버킷에 이미지 파일 PUT 업로드
      await uploadToS3(uploadUrl, selectedImage);

      // 3. AI 이미지 및 텍스트 생성 결과 수신
      const result = await generateFutureSelf(s3Key, quizAnswers);

      // 4. 결과를 sessionStorage에 저장
      sessionStorage.setItem('futureSelfResult', JSON.stringify(result));

      // 5. 결과 페이지로 이동
      router.push('/result');
    } catch (error) {
      console.error(error);
      setErrorMsg(error.message || '처리 도중 예상치 못한 오류가 발생했습니다.');
      setStep('error');
    }
  };

  const handleReset = () => {
    setSelectedImage(null);
    setAnswers({});
    setStep('hero');
  };

  return (
    <div className="main-layout container">
      {step === 'hero' && <Home onStart={handleStart} />}
      
      {step === 'upload' && (
        <Upload 
          onNext={handleUploadNext} 
          selectedImage={selectedImage}
          setSelectedImage={setSelectedImage}
        />
      )}

      {step === 'quiz' && (
        <Quiz 
          onFinish={handleQuizFinish} 
          onBack={handleQuizBack}
        />
      )}

      {step === 'loading' && (
        <div className="loading-screen fade-in">
          <div className="loading-visual">
            <div className="ring-pulse" />
            <Loader2 className="loading-spinner" size={40} />
          </div>
          <div className="loading-tag">
            <Sparkles size={14} className="badge-icon" />
            <span>AI 자아 생성 작동 중</span>
          </div>
          <h3 className="loading-caption">{LOADING_STEPS[loadingTextIdx]}</h3>
          <p className="loading-description">잠시만 기다려주세요. 약 3~5초 후 매칭이 완료됩니다.</p>
        </div>
      )}

      {step === 'error' && (
        <div className="error-screen fade-in">
          <div className="error-icon-wrapper">⚠️</div>
          <h3>분석 실패</h3>
          <p className="error-text">{errorMsg}</p>
          <button className="retry-btn" onClick={handleReset}>
            <RefreshCw size={16} /> 다시 시도하기
          </button>
        </div>
      )}
    </div>
  );
}
