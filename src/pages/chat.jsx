import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { User, Send, Settings } from 'lucide-react'
import './chat.css'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000'

export default function Chat() {
  const navigate = useNavigate()
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const messagesEndRef = useRef(null)
  const textareaRef = useRef(null)

  const sessionId = sessionStorage.getItem('psyche_session_id')
  const personaId = sessionStorage.getItem('psyche_persona_id')
  const weights = JSON.parse(sessionStorage.getItem('psyche_weights') || '{}')

  // Load chat history on mount
  useEffect(() => {
    const loadHistory = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/chat/history/${sessionId}`)
        const data = await res.json()
        if (data.messages && data.messages.length > 0) {
          setMessages(data.messages.map((m, i) => ({
            id: i,
            role: m.role,
            content: m.content,
            time: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }),
          })))
        }
      } catch (err) {
        // No history available — fresh start
      }
    }
    if (sessionId) loadHistory()
  }, [sessionId])

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isTyping])

  // Auto-resize textarea
  const handleInputChange = (e) => {
    setInput(e.target.value)
    const el = e.target
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 120) + 'px'
  }

  const handleSend = async () => {
    const trimmed = input.trim()
    if (!trimmed || isTyping) return

    const userMsg = {
      id: Date.now(),
      role: 'user',
      content: trimmed,
      time: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }),
    }

    setMessages((prev) => [...prev, userMsg])
    setInput('')
    setIsTyping(true)

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }

    try {
      const res = await fetch(`${API_BASE}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          persona_id: parseInt(personaId) || 1,
          message: trimmed,
        }),
      })

      const data = await res.json()

      // Simulate typing delay for immersion
      await new Promise((r) => setTimeout(r, 800 + Math.random() * 700))

      const assistantMsg = {
        id: Date.now() + 1,
        role: 'assistant',
        content: data.reply,
        time: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }),
      }

      setMessages((prev) => [...prev, assistantMsg])
    } catch (err) {
      // Mock fallback
      await new Promise((r) => setTimeout(r, 1000))

      const mockReplies = [
        "네가 지금 걱정하는 그 일, 사실 별거 아니었어.",
        "그때의 너는 정말 최선을 다하고 있었어.",
        "지금 힘든 거 알아. 근데 포기하지 마.",
        "운동 좀 해. 진짜로. 나중에 후회한다.",
        "지금 네가 가장 두려워하는 것에 가까이 가봐.",
      ]

      const assistantMsg = {
        id: Date.now() + 1,
        role: 'assistant',
        content: mockReplies[Math.floor(Math.random() * mockReplies.length)],
        time: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }),
      }

      setMessages((prev) => [...prev, assistantMsg])
    } finally {
      setIsTyping(false)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="chat-page">
      <div className="chat-layout">
        {/* Top Bar */}
        <div className="chat-topbar">
          <div className="chat-profile">
            <div className="chat-avatar">
              <User size={20} />
            </div>
            <div className="chat-profile-info">
              <h2>10년 후의 나</h2>
              <div className="chat-profile-badges">
                {weights.optimism && <span className="chat-badge">{weights.optimism}</span>}
                {weights.value && <span className="chat-badge">{weights.value}</span>}
                {weights.tone && <span className="chat-badge">{weights.tone}</span>}
              </div>
            </div>
          </div>
          <button
            id="settings-btn"
            className="chat-settings-btn"
            onClick={() => navigate('/weight')}
          >
            <Settings size={14} />
            다시 설정
          </button>
        </div>

        {/* Messages */}
        <div className="chat-messages">
          {messages.length === 0 && !isTyping && (
            <div className="chat-welcome">
              <div className="chat-welcome-avatar">
                <User size={28} />
              </div>
              <h3>미래의 나와 대화를 시작하세요</h3>
              <p>
                10년 후의 내가 지금의 나에게<br />
                어떤 이야기를 해줄까요?
              </p>
            </div>
          )}

          {messages.map((msg) => (
            <div key={msg.id} className={`message ${msg.role}`}>
              <div className="message-bubble">
                {msg.content}
              </div>
              <span className="message-time">{msg.time}</span>
            </div>
          ))}

          {isTyping && (
            <div className="typing-indicator">
              <div className="typing-dot" />
              <div className="typing-dot" />
              <div className="typing-dot" />
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="chat-input-area">
          <div className="chat-input-wrapper">
            <textarea
              ref={textareaRef}
              id="chat-input"
              rows="1"
              placeholder="미래의 나에게 말을 걸어보세요..."
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
            />
            <button
              id="send-btn"
              className="chat-send-btn"
              onClick={handleSend}
              disabled={!input.trim() || isTyping}
            >
              <Send size={18} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
