'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import ResultCard from '../../components/resultCard/ResultCard';
import WaitlistModal from '../../components/waitlist/WaitlistModal';
import { ArrowLeft, Sparkles } from 'lucide-react';
import './page.css';

export default function ResultPage() {
  const router = useRouter();
  const [result, setResult] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Retrieve result from sessionStorage
    const storedResult = sessionStorage.getItem('futureSelfResult');
    if (storedResult) {
      try {
        setResult(JSON.parse(storedResult));
      } catch (e) {
        console.error(e);
        router.replace('/');
      }
    } else {
      // If direct access with no data, redirect to landing
      router.replace('/');
    }
    setLoading(false);
  }, [router]);

  if (loading) {
    return (
      <div className="result-layout container">
        <div className="minimal-loader">로딩 중...</div>
      </div>
    );
  }

  if (!result) return null;

  const handleBackToStart = () => {
    sessionStorage.removeItem('futureSelfResult');
    router.push('/');
  };

  return (
    <div className="result-layout container fade-in">
      {/* Top Header Navigation */}
      <div className="result-page-header">
        <button className="back-btn" onClick={handleBackToStart}>
          <ArrowLeft size={16} />
          <span>다시 시작하기</span>
        </button>
        <div className="result-tag">
          <Sparkles size={14} className="accent-icon" />
          <span>생성 완료</span>
        </div>
      </div>

      {/* Main Result Presentation Card */}
      <ResultCard 
        result={result} 
        onOpenWaitlist={() => setIsModalOpen(true)} 
      />

      {/* Waitlist modal popup */}
      <WaitlistModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)}
        quizResult={result.quizSummary || {}}
      />
    </div>
  );
}
