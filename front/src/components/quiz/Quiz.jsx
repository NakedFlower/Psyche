'use client';

import React, { useState } from 'react';
import { ArrowLeft, CheckCircle2 } from 'lucide-react';
import './Quiz.css';

const QUESTIONS = [
  {
    id: 1,
    question: "주말 아침, 눈을 떴을 때 당신이 느끼는 가장 이상적인 기분은?",
    options: [
      "오늘 해야 할 흥미진진한 일들과 약속들이 벌써 기대된다!",
      "아무에게도 방해받지 않고 온전히 나만의 고요함을 만끽하고 싶다."
    ]
  },
  {
    id: 2,
    question: "새로운 모임에 참석했을 때 당신의 일반적인 행동 방식은?",
    options: [
      "먼저 미소를 지으며 말을 건네고 자연스럽게 분위기를 리드한다.",
      "주변을 조용히 관찰하며 대화가 시작되기를 기다린 후 조심스럽게 참여한다."
    ]
  },
  {
    id: 3,
    question: "갑작스러운 스트레스가 생겼을 때, 당신이 해소하는 방법은?",
    options: [
      "친구들과 만나 시끌벅적하게 수다를 떨며 스트레스를 날려 보낸다.",
      "방 안에 조용히 혼자 머무르며 음악을 듣거나 일기를 쓰며 마음을 가라앉힌다."
    ]
  },
  {
    id: 4,
    question: "평소 흥미롭게 찾아보는 콘텐츠나 뉴스의 주된 주제는?",
    options: [
      "최신 기술 트렌드, 우주 혁신, 인공지능, 그리고 스타트업 성장기",
      "마음을 편안하게 해주는 숲 라이프, 문학과 예술, 혹은 여행 에세이"
    ]
  },
  {
    id: 5,
    question: "나만의 독립된 전원주택을 짓는다면 어떤 공간으로 꾸미고 싶나요?",
    options: [
      "최첨단 빌트인 가전과 스마트 조명이 갖춰진 모던하고 미니멀한 공간",
      "다양한 실내 식물들과 포근한 나무 향이 가득한 오가닉하고 자연 친화적인 공간"
    ]
  },
  {
    id: 6,
    question: "당신이 생각하는 더 궁극적인 삶의 가치는 어느 쪽에 가까운가요?",
    options: [
      "세상에 지적인 혁신을 제공하거나, 영향력 있는 발자취를 남기는 것",
      "내면의 단단한 평화를 일구며, 주변 사람들에게 따뜻한 위안이 되는 것"
    ]
  },
  {
    id: 7,
    question: "어려운 과제를 처리하거나 공부를 해야 할 때 나의 태도는?",
    options: [
      "계획표를 체계적으로 작성하고 일정을 지켜나가는 데서 안도감과 성취감을 느낀다.",
      "자유롭게 생각을 열어두고, 결정적인 순간에 폭발적인 몰입감으로 처리한다."
    ]
  },
  {
    id: 8,
    question: "친구들과 여행 계획을 세울 때 나의 행동은?",
    options: [
      "숙소 예약, 맛집 탐방, 하루 이동 일정까지 꼼꼼히 짜서 공유한다.",
      "대략적인 목적지만 정해두고, 구체적인 것은 그날의 날씨와 기분에 맡긴다."
    ]
  },
  {
    id: 9,
    question: "인생의 중대한 결정을 내려야 할 때 가장 먼저 신뢰하는 것은?",
    options: [
      "수치로 증명된 정확한 데이터와 논리적인 타당성",
      "상황 전체를 직감하는 예리한 통찰력과 마음의 확신"
    ]
  },
  {
    id: 10,
    question: "새롭고 생소한 분야에 관한 대화를 나눌 때의 나의 흥미도는?",
    options: [
      "호기심이 강해져 꼬리를 무는 질문을 연이어 던지며 배우려 한다.",
      "핵심 개념만 가볍게 파악하고, 실생활에 적용할 부분이 있는지를 먼저 본다."
    ]
  },
  {
    id: 11,
    question: "팀을 이루어 작업을 수행할 때 본인에게 더 적합한 역할은?",
    options: [
      "전체 조율을 맡아 팀원들의 힘을 하나로 묶고 조율해내는 리더",
      "묵묵히 맡은 영역을 깊이 파고들어 완성도 높은 솔루션을 제공하는 스페셜리스트"
    ]
  },
  {
    id: 12,
    question: "새로운 기회가 찾아왔을 때 리스크를 대하는 나의 성향은?",
    options: [
      "빠르게 도전하고, 발생하는 문제는 직면하여 돌파해 나가는 과감함",
      "예측 가능한 리스크를 하나씩 검증하며 돌다리도 두들겨 보는 신중함"
    ]
  },
  {
    id: 13,
    question: "타인에게 비쳐지고 싶은 나에 가까운 이미지는?",
    options: [
      "매사에 당당하고, 넘치는 열정과 에너지로 도전을 주도하는 사람",
      "차분하지만 단단한 내공이 느껴지고, 신뢰를 주는 사람"
    ]
  },
  {
    id: 14,
    question: "당신이 꿈꾸는 미래 문명의 사회 구조에 더 바라는 모습은?",
    options: [
      "우주 개척과 완전 자동화 로봇 기술이 꽃피워 낸 극도의 편리한 문명",
      "자연 생태계가 완벽히 보존되고 유기적으로 순환하는 인간 중심의 숲 생태 문명"
    ]
  },
  {
    id: 15,
    question: "일상 속에서 소소한 행복을 가장 뚜렷하게 체감할 때는?",
    options: [
      "새로운 지식을 알게 되거나 계획한 하루를 모두 완수했을 때",
      "커피 한 잔을 내리거나 붉게 물든 노을을 멍하니 바라볼 때"
    ]
  },
  {
    id: 16,
    question: "만약 여유시간이 생겨 독서를 한다면 어떤 종류의 책을 집어 드시겠습니까?",
    options: [
      "세상의 메커니즘을 설명하는 역사, 과학, 경영 또는 자기계발 서적",
      "인간의 숨겨진 감정을 섬세하게 매만지는 에세이, 소설 또는 서정 시집"
    ]
  },
  {
    id: 17,
    question: "대화를 나누는 중 나를 가장 벅차게 만드는 대화 유형은?",
    options: [
      "유쾌한 웃음소리가 가득하며, 다양한 화제가 쉴 새 없이 오고 가는 활기찬 수다",
      "서로의 깊은 가치관, 고민, 그리고 인생 이야기를 터놓고 교감하는 차분한 속삭임"
    ]
  },
  {
    id: 18,
    question: "내가 가장 피하고 싶은 비효율적인 환경은?",
    options: [
      "성장이나 개선의 의지가 없고, 구태의연한 관습에 얽매여 멈춰있는 집단",
      "서로가 서로를 끊임없이 비교하고 경쟁하게 만드는 과한 소음과 투쟁의 현장"
    ]
  },
  {
    id: 19,
    question: "여행 중 찍는 사진 중에서 내 앨범에 가장 오래 남는 사진 스타일은?",
    options: [
      "이국적인 배경 앞에서 기분 좋은 포즈를 취하고 있는 멋진 나의 모습",
      "마음을 평온하게 했던 낡은 기둥, 스쳐 간 들풀, 소박한 자연물과 그림자"
    ]
  },
  {
    id: 20,
    question: "만약 타임머신이 단 한 번 작동한다면 가보고 싶은 시간대는?",
    options: [
      "수십 세기 뒤 미지의 개척 영역이 가득한 미래의 인류 사회",
      "순수하고 느리게 흘렀던 찬란한 과거 인류의 역사적 시공간"
    ]
  }
];

export default function Quiz({ onFinish, onBack }) {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState({});
  const [direction, setDirection] = useState('forward'); // forward, backward

  const currentQuestion = QUESTIONS[currentIdx];
  const progressPercent = Math.round(((currentIdx + 1) / QUESTIONS.length) * 100);

  const handleSelectOption = (optionIndex) => {
    // Save answer
    const newAnswers = { ...answers, [currentQuestion.id]: optionIndex };
    setAnswers(newAnswers);

    if (currentIdx < QUESTIONS.length - 1) {
      setDirection('forward');
      // Slide to next question after a micro-delay
      setTimeout(() => {
        setCurrentIdx(prev => prev + 1);
      }, 150);
    } else {
      // Finished all questions!
      onFinish(newAnswers);
    }
  };

  const handlePrev = () => {
    if (currentIdx > 0) {
      setDirection('backward');
      setCurrentIdx(prev => prev - 1);
    } else {
      onBack();
    }
  };

  return (
    <div className="quiz-container fade-in">
      {/* Quiz Top Navigation */}
      <div className="quiz-nav">
        <button className="back-nav-btn" onClick={handlePrev} aria-label="이전 단계로">
          <ArrowLeft size={16} />
          <span>이전</span>
        </button>
        <span className="step-counter">
          <strong>{currentIdx + 1}</strong> / {QUESTIONS.length}
        </span>
      </div>

      {/* Elegant Smooth Progress Bar */}
      <div className="progress-bar-container">
        <div 
          className="progress-bar-fill" 
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* Active Question Content */}
      <div className={`question-wrapper slide-${direction}`}>
        <h3 className="quiz-question">{currentQuestion.question}</h3>
        
        <div className="options-grid">
          {currentQuestion.options.map((option, idx) => {
            const isSelected = answers[currentQuestion.id] === idx;
            return (
              <button 
                key={idx} 
                className={`option-card ${isSelected ? 'selected' : ''}`}
                onClick={() => handleSelectOption(idx)}
              >
                <div className="option-select-indicator">
                  {isSelected ? (
                    <CheckCircle2 className="checked-icon" size={20} />
                  ) : (
                    <div className="circle-placeholder" />
                  )}
                </div>
                <span className="option-text">{option}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
