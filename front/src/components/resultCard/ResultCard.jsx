'use client';

import React from 'react';
import { Share2, MessageSquare, Copy, Check } from 'lucide-react';
import './ResultCard.css';

export default function ResultCard({ result, onOpenWaitlist }) {
  const [copied, setCopied] = React.useState(false);

  if (!result) return null;

  const handleShareTwitter = () => {
    const text = `30년 후 내 미래의 자아는 [${result.job}]! 성격 키워드: ${result.keywords.join(', ')}. 당신의 미래 자아를 지금 만나보세요!`;
    const url = window.location.origin;
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`, '_blank');
  };

  const handleShareKakao = () => {
    // Simple Kakao link share simulation / alert
    alert('카카오톡 공유 링크가 복사되었습니다. 원하는 대화방에 붙여넣어주세요!');
    handleCopyLink();
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.origin);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="result-wrapper fade-in">
      {/* Premium Passport-style Solid Card */}
      <div className="id-card" id="result-card-capture">
        <div className="id-card-header">
          <span className="archive-code">FUTURE ARCHIVE // VOL. 2056</span>
          <span className="status-indicator">ACTIVE</span>
        </div>

        <div className="id-card-body">
          <div className="id-card-visual">
            <div className="portrait-wrapper">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img 
                src={result.futureImageUrl} 
                alt="Future Self Portrait" 
                className="portrait-image" 
              />
              <div className="stamp-overlay">CONFIRMED</div>
            </div>
          </div>

          <div className="id-card-info">
            <div className="info-header">
              <span className="info-label">30년 후 미래의 직업</span>
              <h2 className="info-job">{result.job}</h2>
            </div>

            <div className="info-keywords">
              {result.keywords.map((kw, index) => (
                <span key={index} className="keyword-chip">#{kw}</span>
              ))}
            </div>

            <div className="info-divider" />

            <div className="info-personality">
              <span className="info-label">내면의 성격 분석</span>
              <p>{result.personality}</p>
            </div>

            <div className="info-message-box">
              <span className="message-label">현재의 나에게 보내는 전언</span>
              <p className="message-content">“{result.message}”</p>
            </div>
          </div>
        </div>

        <div className="id-card-footer">
          <div className="barcode-wrapper">
            <div className="barcode" />
            <span className="barcode-text">F U T U R E - S E L F - {result.keywords.join('-').toUpperCase()}</span>
          </div>
        </div>
      </div>

      {/* Action Buttons Area */}
      <div className="actions-section">
        <button className="chat-cta-btn" onClick={onOpenWaitlist}>
          <MessageSquare size={18} />
          <span>미래의 나와 대화해보기</span>
        </button>

        <div className="sharing-toolbox">
          <span className="share-title">결과 공유하기</span>
          <div className="share-buttons-row">
            <button className="share-icon-btn kakao" onClick={handleShareKakao} aria-label="카카오톡으로 공유">
              <span className="custom-kakao-icon">Talk</span>
            </button>
            <button className="share-icon-btn twitter" onClick={handleShareTwitter} aria-label="X로 공유">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
              </svg>
            </button>
            <button className="share-icon-btn copy" onClick={handleCopyLink} aria-label="링크 복사">
              {copied ? <Check size={18} className="checked-color" /> : <Copy size={18} />}
            </button>
          </div>
          {copied && <span className="copied-toast">클립보드에 링크가 복사되었습니다!</span>}
        </div>
      </div>
    </div>
  );
}
