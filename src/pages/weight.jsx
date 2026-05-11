import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { User } from 'lucide-react'
import './weight.css'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000'

function getPreviewText(optimism, value, tone) {
  const outlook = optimism < 0.5 ? '낙관적' : '비관적'
  const coreValue = value < 0.5 ? '성공' : '행복'
  const speaking = tone < 0.5 ? '격려' : '직언'

  const texts = {
    '낙관적-성공-격려': '당신의 커리어가 꽃피운 미래의 나와 따뜻한 대화를 나눕니다.',
    '낙관적-성공-직언': '밝은 미래를 향해 날카로운 조언을 건네는 나와 대화합니다.',
    '낙관적-행복-격려': '소소한 행복을 아는 미래의 나가 당신을 응원합니다.',
    '낙관적-행복-직언': '자유롭고 솔직한 미래의 나와 진심을 나눕니다.',
    '비관적-성공-격려': '힘든 시간을 이겨낸 미래의 나가 부드럽게 이끌어줍니다.',
    '비관적-성공-직언': '냉정한 현실주의자 미래의 나와 실질적인 대화를 나눕니다.',
    '비관적-행복-격려': '삶의 무게를 아는 미래의 나가 천천히 괜찮다고 말합니다.',
    '비관적-행복-직언': '현실을 직시하는 미래의 나와 솔직한 대화를 나눕니다.',
  }

  const key = `${outlook}-${coreValue}-${speaking}`
  return texts[key] || '당신만의 특별한 미래의 자아와 대화합니다.'
}

export default function Weight() {
  const navigate = useNavigate()
  const [optimism, setOptimism] = useState(0.5)
  const [value, setValue] = useState(0.5)
  const [tone, setTone] = useState(0.5)
  const [isCreating, setIsCreating] = useState(false)

  const sessionId = sessionStorage.getItem('psyche_session_id')

  const handleCreate = async () => {
    if (isCreating) return
    setIsCreating(true)

    try {
      const res = await fetch(`${API_BASE}/api/persona`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          optimism_weight: optimism,
          value_weight: value,
          tone_weight: tone,
        }),
      })

      const data = await res.json()
      sessionStorage.setItem('psyche_persona_id', String(data.persona_id))

      // Save weight labels for chat display
      sessionStorage.setItem('psyche_weights', JSON.stringify({
        optimism: optimism < 0.5 ? '낙관적' : '비관적',
        value: value < 0.5 ? '성공' : '행복',
        tone: tone < 0.5 ? '격려' : '직언',
      }))

      navigate('/chat')
    } catch (err) {
      console.error('Persona creation error:', err)
      // Mock fallback
      sessionStorage.setItem('psyche_persona_id', '1')
      sessionStorage.setItem('psyche_weights', JSON.stringify({
        optimism: optimism < 0.5 ? '낙관적' : '비관적',
        value: value < 0.5 ? '성공' : '행복',
        tone: tone < 0.5 ? '격려' : '직언',
      }))
      navigate('/chat')
    } finally {
      setIsCreating(false)
    }
  }

  const outlookLabel = optimism < 0.5 ? '낙관적' : '비관적'
  const coreValueLabel = value < 0.5 ? '성공' : '행복'
  const speakingLabel = tone < 0.5 ? '격려' : '직언'

  return (
    <div className="weight-page">
      <div className="weight-header">
        <h1>미래의 나를<br />설정하세요</h1>
        <p>슬라이더를 조절해 미래 자아의 성격을 만들어보세요.</p>
      </div>

      <div className="weight-sliders">
        {/* Optimism Slider */}
        <div className="slider-card">
          <div className="slider-label">시나리오 기대치</div>
          <div className="slider-wrapper">
            <input
              id="optimism-slider"
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={optimism}
              onChange={(e) => setOptimism(parseFloat(e.target.value))}
            />
            <div className="slider-range-labels">
              <span className={optimism < 0.5 ? 'active-label' : ''}>낙관적</span>
              <span className={optimism >= 0.5 ? 'active-label' : ''}>비관적</span>
            </div>
          </div>
        </div>

        {/* Value Slider */}
        <div className="slider-card">
          <div className="slider-label">삶의 핵심 가치</div>
          <div className="slider-wrapper">
            <input
              id="value-slider"
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={value}
              onChange={(e) => setValue(parseFloat(e.target.value))}
            />
            <div className="slider-range-labels">
              <span className={value < 0.5 ? 'active-label' : ''}>성공</span>
              <span className={value >= 0.5 ? 'active-label' : ''}>행복</span>
            </div>
          </div>
        </div>

        {/* Tone Slider */}
        <div className="slider-card">
          <div className="slider-label">대화의 온도</div>
          <div className="slider-wrapper">
            <input
              id="tone-slider"
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={tone}
              onChange={(e) => setTone(parseFloat(e.target.value))}
            />
            <div className="slider-range-labels">
              <span className={tone < 0.5 ? 'active-label' : ''}>격려</span>
              <span className={tone >= 0.5 ? 'active-label' : ''}>직언</span>
            </div>
          </div>
        </div>
      </div>

      {/* Preview */}
      <div className="weight-preview">
        <div className="preview-icon">
          <User size={24} />
        </div>
        <p className="preview-text">
          {getPreviewText(optimism, value, tone)}
        </p>
        <div className="preview-badges">
          <span className="preview-badge">{outlookLabel}</span>
          <span className="preview-badge">{coreValueLabel}</span>
          <span className="preview-badge">{speakingLabel}</span>
        </div>
      </div>

      {/* CTA */}
      <div className="weight-cta">
        <button
          id="create-persona-btn"
          className="btn-primary"
          onClick={handleCreate}
          disabled={isCreating}
        >
          {isCreating ? '생성 중...' : '페르소나 생성하기'}
        </button>
      </div>
    </div>
  )
}
