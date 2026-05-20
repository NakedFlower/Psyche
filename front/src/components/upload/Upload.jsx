'use client';

import React, { useState, useRef } from 'react';
import { Upload as UploadIcon, Image as ImageIcon, X, ArrowRight, Camera } from 'lucide-react';
import './Upload.css';

export default function Upload({ onNext, selectedImage, setSelectedImage }) {
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const processFile = (file) => {
    if (!file) return;

    // Check if the file is an image
    if (!file.type.startsWith('image/')) {
      setError('이미지 파일(PNG, JPG, JPEG 등)만 업로드할 수 있습니다.');
      return;
    }

    // Check file size (limit to 5MB)
    if (file.size > 5 * 1024 * 1024) {
      setError('이미지 용량은 최대 5MB를 넘을 수 없습니다.');
      return;
    }

    setError('');
    setSelectedImage(file);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleChange = (e) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  const onButtonClick = () => {
    fileInputRef.current.click();
  };

  const removeImage = () => {
    setSelectedImage(null);
    setError('');
  };

  return (
    <div className="upload-container fade-in">
      <div className="upload-header">
        <span className="step-badge">STEP 1</span>
        <h2>본인의 사진을 올려주세요</h2>
        <p>미래의 모습을 정밀하게 예측하기 위해 얼굴이 정면으로 뚜렷하게 나온 사진을 권장합니다.</p>
      </div>

      <div 
        className={`drop-zone ${dragActive ? 'drag-active' : ''} ${selectedImage ? 'has-image' : ''}`}
        onDragEnter={handleDrag}
        onDragOver={handleDrag}
        onDragLeave={handleDrag}
        onDrop={handleDrop}
      >
        <input 
          ref={fileInputRef}
          type="file" 
          className="file-input" 
          accept="image/*" 
          onChange={handleChange} 
        />

        {selectedImage ? (
          <div className="preview-container">
            <div className="preview-frame">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img 
                src={URL.createObjectURL(selectedImage)} 
                alt="Upload preview" 
                className="image-preview" 
              />
            </div>
            <button className="remove-btn" onClick={removeImage} aria-label="사진 삭제">
              <X size={16} />
            </button>
            <div className="file-info">
              <ImageIcon size={14} />
              <span>{selectedImage.name}</span>
            </div>
          </div>
        ) : (
          <div className="drop-content" onClick={onButtonClick}>
            <div className="icon-wrapper">
              <Camera size={28} className="upload-icon" />
            </div>
            <p className="main-instruction">사진 선택하기 또는 마우스로 드래그</p>
            <p className="sub-instruction">최대 파일 크기: 5MB (JPG, PNG, WebP)</p>
          </div>
        )}
      </div>

      {error && <p className="error-message">{error}</p>}

      <button 
        className="next-button" 
        disabled={!selectedImage} 
        onClick={onNext}
      >
        설문 시작하기 <ArrowRight size={18} />
      </button>
    </div>
  );
}
