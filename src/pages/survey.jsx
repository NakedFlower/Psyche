import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Camera, X } from 'lucide-react'
import './survey.css'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000'

const MBTI_TYPES = [
  'ISTJ', 'ISFJ', 'INFJ', 'INTJ',
  'ISTP', 'ISFP', 'INFP', 'INTP',
  'ESTP', 'ESFP', 'ENFP', 'ENTP',
  'ESTJ', 'ESFJ', 'ENFJ', 'ENTJ',
]

export default function Survey() {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)

  // Step 1: Photos
  const [photos, setPhotos] = useState([null, null, null])
  const [photoFiles, setPhotoFiles] = useState([null, null, null])
  const fileInputRefs = [useRef(null), useRef(null), useRef(null)]

  // Step 2: MBTI
  const [mbti, setMbti] = useState('')

  // Step 3: Text inputs
  const [values, setValues] = useState('')
  const [habits, setHabits] = useState('')
  const [interests, setInterests] = useState('')
  const [goals, setGoals] = useState('')

  // Step 4: Worries
  const [worries, setWorries] = useState('')

  const [isSubmitting, setIsSubmitting] = useState(false)

  const sessionId = sessionStorage.getItem('psyche_session_id')

  /* --- Photo handlers --- */
  const handlePhotoSelect = (index) => {
    fileInputRefs[index].current?.click()
  }

  const handleFileChange = (index, e) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (ev) => {
      const newPhotos = [...photos]
      newPhotos[index] = ev.target.result
      setPhotos(newPhotos)

      const newFiles = [...photoFiles]
      newFiles[index] = file
      setPhotoFiles(newFiles)
    }
    reader.readAsDataURL(file)
  }

  const handlePhotoRemove = (index, e) => {
    e.stopPropagation()
    const newPhotos = [...photos]
    newPhotos[index] = null
    setPhotos(newPhotos)

    const newFiles = [...photoFiles]
    newFiles[index] = null
    setPhotoFiles(newFiles)
  }

  /* --- Upload photos to S3 via presigned URL --- */
  const uploadPhotos = async () => {
    const uploadedKeys = []

    for (let i = 0; i < photoFiles.length; i++) {
      const file = photoFiles[i]
      if (!file) continue

      try {
        const res = await fetch(`${API_BASE}/api/photo/presigned-url`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            session_id: sessionId,
            filename: `photo${i + 1}.jpg`,
          }),
        })
        const data = await res.json()

        // Upload directly to S3
        await fetch(data.upload_url, {
          method: 'PUT',
          headers: { 'Content-Type': 'image/jpeg' },
          body: file,
        })

        uploadedKeys.push(data.object_key)
      } catch (err) {
        console.warn('Photo upload failed:', err)
      }
    }

    return uploadedKeys.join(',')
  }

  /* --- Submit survey --- */
  const handleSubmit = async () => {
    if (isSubmitting) return
    setIsSubmitting(true)

    try {
      // Upload photos first
      const photoKey = await uploadPhotos()

      // Submit survey data
      const res = await fetch(`${API_BASE}/api/survey`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          mbti,
          values_text: values,
          habits_text: habits,
          interests_text: interests,
          goals_text: goals,
          worries_text: worries,
          photo_key: photoKey || null,
        }),
      })

      const data = await res.json()
      sessionStorage.setItem('psyche_survey_id', String(data.survey_id))
      navigate('/weight')
    } catch (err) {
      console.error('Survey submit error:', err)
      // In mock mode, navigate anyway
      navigate('/weight')
    } finally {
      setIsSubmitting(false)
    }
  }

  /* --- Step validation --- */
  const canProceed = () => {
    switch (step) {
      case 0: return true // Photos are optional
      case 1: return mbti !== ''
      case 2: return values.trim() !== '' || habits.trim() !== '' || interests.trim() !== '' || goals.trim() !== ''
      case 3: return worries.trim() !== ''
      default: return false
    }
  }

  const handleNext = () => {
    if (step < 3) {
      setStep(step + 1)
    } else {
      handleSubmit()
    }
  }

  const handleBack = () => {
    if (step > 0) setStep(step - 1)
  }

  /* --- Render steps --- */
  const renderStep = () => {
    switch (step) {
      case 0:
        return (
          <div className="step-content" key="step-0">
            <h2 className="step-title">사진을 올려주세요</h2>
            <p className="step-description">
              미래의 나를 시각화하는 데 사용됩니다.
            </p>
            <div className="photo-upload-area">
              {photos.map((photo, idx) => (
                <div
                  key={idx}
                  className={`photo-slot ${photo ? 'has-photo' : ''}`}
                  onClick={() => handlePhotoSelect(idx)}
                >
                  {photo ? (
                    <>
                      <img src={photo} alt={`사진 ${idx + 1}`} />
                      <button
                        className="photo-remove"
                        onClick={(e) => handlePhotoRemove(idx, e)}
                        aria-label="사진 삭제"
                      >
                        <X size={14} />
                      </button>
                    </>
                  ) : (
                    <>
                      <Camera size={24} className="photo-slot-icon" />
                      <span className="photo-slot-text">사진 {idx + 1}</span>
                    </>
                  )}
                  <input
                    ref={fileInputRefs[idx]}
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleFileChange(idx, e)}
                  />
                </div>
              ))}
            </div>
            <p className="skip-note">최대 3장까지 업로드할 수 있어요</p>
          </div>
        )

      case 1:
        return (
          <div className="step-content" key="step-1">
            <h2 className="step-title">MBTI를 선택하세요</h2>
            <p className="step-description">
              미래의 나의 성격을 만드는 데 참고됩니다.
            </p>
            <div className="mbti-grid">
              {MBTI_TYPES.map((type) => (
                <button
                  key={type}
                  className={`mbti-btn ${mbti === type ? 'selected' : ''}`}
                  onClick={() => setMbti(type)}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>
        )

      case 2:
        return (
          <div className="step-content" key="step-2">
            <h2 className="step-title">나에 대해 알려주세요</h2>
            <p className="step-description">
              미래의 나가 당신을 더 잘 이해할 수 있도록 도와주세요.
            </p>
            <div className="text-fields">
              <div className="text-field-group">
                <label htmlFor="values-input">가치관</label>
                <textarea
                  id="values-input"
                  placeholder="당신이 가장 중요하게 생각하는 것은 무엇인가요?"
                  value={values}
                  onChange={(e) => setValues(e.target.value)}
                />
              </div>
              <div className="text-field-group">
                <label htmlFor="habits-input">생활습관</label>
                <textarea
                  id="habits-input"
                  placeholder="평소 어떤 루틴으로 하루를 보내나요?"
                  value={habits}
                  onChange={(e) => setHabits(e.target.value)}
                />
              </div>
              <div className="text-field-group">
                <label htmlFor="interests-input">관심사</label>
                <textarea
                  id="interests-input"
                  placeholder="요즘 가장 관심 있는 분야나 활동은?"
                  value={interests}
                  onChange={(e) => setInterests(e.target.value)}
                />
              </div>
              <div className="text-field-group">
                <label htmlFor="goals-input">목표</label>
                <textarea
                  id="goals-input"
                  placeholder="1년, 5년 후 이루고 싶은 목표가 있나요?"
                  value={goals}
                  onChange={(e) => setGoals(e.target.value)}
                />
              </div>
            </div>
          </div>
        )

      case 3:
        return (
          <div className="step-content" key="step-3">
            <h2 className="step-title">지금 가장 큰 고민은?</h2>
            <p className="step-description">
              미래의 나에게 솔직하게 이야기해보세요.
            </p>
            <textarea
              id="worries-input"
              className="worries-textarea"
              placeholder="지금 당신을 가장 힘들게 하는 것, 불안하게 하는 것이 있다면 자유롭게 적어주세요..."
              value={worries}
              onChange={(e) => setWorries(e.target.value)}
            />
          </div>
        )

      default:
        return null
    }
  }

  return (
    <div className="survey-page">
      {/* Step Indicator */}
      <div className="step-indicator">
        {[0, 1, 2, 3].map((s, i) => (
          <div key={s} style={{ display: 'contents' }}>
            <div
              className={`step-dot ${s === step ? 'active' : ''} ${s < step ? 'completed' : ''}`}
            />
            {i < 3 && (
              <div className={`step-connector ${s < step ? 'active' : ''}`} />
            )}
          </div>
        ))}
      </div>

      {/* Step Content */}
      {renderStep()}

      {/* Actions */}
      <div className="step-actions">
        {step > 0 && (
          <button
            id="survey-back-btn"
            className="btn-secondary"
            onClick={handleBack}
          >
            이전
          </button>
        )}
        <button
          id="survey-next-btn"
          className="btn-primary"
          onClick={handleNext}
          disabled={!canProceed() || isSubmitting}
        >
          {step === 3
            ? isSubmitting
              ? '제출 중...'
              : '제출하기'
            : '다음'}
        </button>
      </div>
    </div>
  )
}
