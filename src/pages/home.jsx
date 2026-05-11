import { useNavigate } from 'react-router-dom'
import { Brain, Sparkles, Target } from 'lucide-react'
import { v4 as uuidv4 } from 'uuid'
import './home.css'

export default function Home() {
  const navigate = useNavigate()

  const handleStart = () => {
    // Generate a new session UUID and persist it
    let sessionId = sessionStorage.getItem('psyche_session_id')
    if (!sessionId) {
      sessionId = crypto.randomUUID?.() || uuidv4()
      sessionStorage.setItem('psyche_session_id', sessionId)
    }
    navigate('/survey')
  }

  return (
    <div className="home-page">
      <div className="home-hero">
        <h1 className="home-logo">
          Psy<span>che</span>
        </h1>
        <p className="home-tagline">
          미래의 나와 대화하며,<br />
          지금의 나를 이해하세요.
        </p>

        <div className="home-values">
          <div className="value-card">
            <div className="value-icon">
              <Brain size={22} />
            </div>
            <div className="value-text">
              <h3>자기이해</h3>
              <p>내면을 들여다보는 깊은 대화</p>
            </div>
          </div>

          <div className="value-card">
            <div className="value-icon">
              <Sparkles size={22} />
            </div>
            <div className="value-text">
              <h3>동기부여</h3>
              <p>미래의 나가 건네는 응원과 조언</p>
            </div>
          </div>

          <div className="value-card">
            <div className="value-icon">
              <Target size={22} />
            </div>
            <div className="value-text">
              <h3>습관개선</h3>
              <p>더 나은 내일을 위한 작은 변화</p>
            </div>
          </div>
        </div>
      </div>

      <div className="home-cta">
        <button
          id="start-button"
          className="btn-primary"
          onClick={handleStart}
        >
          미래의 나와 대화 시작하기
        </button>
        <p className="home-footer-text">
          로그인 없이 바로 시작할 수 있어요
        </p>
      </div>
    </div>
  )
}
