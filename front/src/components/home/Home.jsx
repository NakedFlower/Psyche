'use client';

import React from 'react';
import { ArrowRight, Sparkles, User, ShieldCheck } from 'lucide-react';
import './Home.css';

export default function Home({ onStart }) {
  return (
    <section className="hero-section fade-in">
      <div className="badge">
        <Sparkles size={14} className="badge-icon" />
        <span>30년 후의 나를 만나다</span>
      </div>
      
      <h1 className="hero-title">
        인공지능이 그리는<br />
        <span>미래 자아 생성기</span>
      </h1>
      
      <p className="hero-subtitle">
        단 한 장의 얼굴 사진과 20가지 성격 설문을 분석하여,<br />
        30년 후 마주하게 될 당신의 얼굴과 삶의 이야기를 그려냅니다.
      </p>
      
      <button className="cta-button" onClick={onStart}>
        시작하기 <ArrowRight size={18} className="btn-icon" />
      </button>

      <div className="hero-features">
        <div className="feature-item">
          <User size={18} className="feature-icon" />
          <span>개인화된 얼굴 변환</span>
        </div>
        <div className="feature-item">
          <Sparkles size={18} className="feature-icon" />
          <span>맞춤형 미래 스토리</span>
        </div>
        <div className="feature-item">
          <ShieldCheck size={18} className="feature-icon" />
          <span>100% 개인정보 보장</span>
        </div>
      </div>
    </section>
  );
}
