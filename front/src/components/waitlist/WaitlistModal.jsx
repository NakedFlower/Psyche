'use client';

import React, { useState, useEffect } from 'react';
import { X, Mail, CheckCircle2, ArrowRight, Loader2 } from 'lucide-react';
import { registerWaitlist } from '../../lib/api';
import './WaitlistModal.css';

export default function WaitlistModal({ isOpen, onClose, quizResult }) {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState('idle'); // idle, loading, success, error
  const [errorMessage, setErrorMessage] = useState('');

  // Close on ESC key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden'; // Lock background scroll
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !email.includes('@')) {
      setErrorMessage('올바른 이메일 주소를 입력해주세요.');
      setStatus('error');
      return;
    }

    setStatus('loading');
    setErrorMessage('');

    try {
      // source represents how the user landed, e.g. web
      await registerWaitlist(email, quizResult, 'web');
      setStatus('success');
    } catch (err) {
      setStatus('error');
      if (err.message && err.message.includes('already exist')) {
        setErrorMessage('이미 사전 신청이 완료된 이메일입니다.');
      } else {
        setErrorMessage(err.message || '신청 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.');
      }
    }
  };

  const handleBackdropClick = (e) => {
    if (e.target.classList.contains('modal-backdrop')) {
      onClose();
    }
  };

  return (
    <div className="modal-backdrop fade-in" onClick={handleBackdropClick}>
      <div className="modal-content">
        <button className="modal-close-btn" onClick={onClose} aria-label="닫기">
          <X size={18} />
        </button>

        {status === 'success' ? (
          <div className="success-view">
            <div className="success-icon-wrapper">
              <CheckCircle2 size={40} className="success-icon" />
            </div>
            <h3>사전 신청이 완료되었습니다!</h3>
            <p>정식 출시 및 기능 업데이트 소식을 가장 먼저 메일로 보내드릴게요. 감사합니다.</p>
            <button className="confirm-btn" onClick={onClose}>
              확인
            </button>
          </div>
        ) : (
          <div className="form-view">
            <div className="badge-alert">기능 안내</div>
            <h3>미래의 나와 대화해보기</h3>
            <p className="notice-text">
              현재 준비 중인 기능입니다.<br />
              정식 출시 시 가장 먼저 알림을 보내드릴게요!
            </p>

            <form onSubmit={handleSubmit} className="waitlist-form">
              <div className="input-group">
                <Mail size={16} className="input-icon" />
                <input 
                  type="email" 
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (status === 'error') setStatus('idle');
                  }}
                  placeholder="이메일 주소를 입력하세요"
                  required
                  disabled={status === 'loading'}
                  className={status === 'error' ? 'input-error' : ''}
                />
              </div>

              {status === 'error' && <p className="error-text">{errorMessage}</p>}

              <button 
                type="submit" 
                className="submit-btn"
                disabled={status === 'loading'}
              >
                {status === 'loading' ? (
                  <>
                    <Loader2 size={16} className="spinner" /> 신청하는 중...
                  </>
                ) : (
                  <>
                    소식 받기 <ArrowRight size={16} />
                  </>
                )}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
