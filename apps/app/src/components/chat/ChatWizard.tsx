"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Loader2, Send, RotateCcw } from "lucide-react"
import type { ChatMessage, ChatTurnResponse, ModuleId } from "./types"

interface ChatWizardProps<T> {
  moduleId: ModuleId
  messages: ChatMessage[]
  onMessagesChange: (messages: ChatMessage[]) => void
  onComplete: (extracted: T) => void
  placeholder?: string
}

// ─── Bubble components ────────────────────────────────────────────────────────

function AssistantBubble({ content }: { content: string }) {
  const parts = content.split(/(\*\*[^*]+\*\*)/)
  return (
    <div className="flex gap-3 items-start">
      <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-xs font-bold shrink-0">
        AI
      </div>
      <div className="bg-muted rounded-2xl rounded-tl-sm px-4 py-3 max-w-[80%] text-sm leading-relaxed whitespace-pre-line">
        {parts.map((part, i) =>
          part.startsWith("**") && part.endsWith("**")
            ? <strong key={i}>{part.slice(2, -2)}</strong>
            : <span key={i}>{part}</span>
        )}
      </div>
    </div>
  )
}

function UserBubble({ content }: { content: string }) {
  return (
    <div className="flex gap-3 items-start justify-end">
      <div className="bg-primary text-primary-foreground rounded-2xl rounded-tr-sm px-4 py-3 max-w-[80%] text-sm leading-relaxed whitespace-pre-line">
        {content}
      </div>
    </div>
  )
}

function TypingIndicator() {
  return (
    <div className="flex gap-3 items-start">
      <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-xs font-bold shrink-0">
        AI
      </div>
      <div className="bg-muted rounded-2xl rounded-tl-sm px-4 py-3">
        <div className="flex gap-1">
          <span className="w-2 h-2 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:0ms]" />
          <span className="w-2 h-2 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:150ms]" />
          <span className="w-2 h-2 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:300ms]" />
        </div>
      </div>
    </div>
  )
}

// ─── Generating overlay ───────────────────────────────────────────────────────

function GeneratingOverlay({ progress }: { progress: number }) {
  const steps = [
    { at: 0,  label: "Analisando a conversa..." },
    { at: 20, label: "Mapeando a personalidade..." },
    { at: 40, label: "Calibrando o estilo de escrita..." },
    { at: 60, label: "Definindo valores e filosofia..." },
    { at: 80, label: "Finalizando o perfil completo..." },
    { at: 95, label: "Quase lá..." },
  ]
  const label = [...steps].reverse().find(s => progress >= s.at)?.label ?? steps[0].label

  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-background/95 backdrop-blur-sm rounded-2xl gap-6 px-8">
      {/* Animated rings */}
      <div className="relative flex items-center justify-center">
        <div className="absolute w-24 h-24 rounded-full border-2 border-primary/20 animate-ping [animation-duration:2s]" />
        <div className="absolute w-16 h-16 rounded-full border-2 border-primary/30 animate-ping [animation-duration:2.5s] [animation-delay:0.5s]" />
        <div className="w-20 h-20 rounded-full border-4 border-muted flex items-center justify-center relative">
          {/* Circular progress */}
          <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 80 80">
            <circle cx="40" cy="40" r="36" fill="none" stroke="currentColor" strokeWidth="4" className="text-muted" />
            <circle
              cx="40" cy="40" r="36" fill="none" stroke="currentColor" strokeWidth="4"
              className="text-primary transition-all duration-300"
              strokeDasharray={`${2 * Math.PI * 36}`}
              strokeDashoffset={`${2 * Math.PI * 36 * (1 - progress / 100)}`}
              strokeLinecap="round"
            />
          </svg>
          <span className="text-lg font-bold tabular-nums text-primary">{Math.round(progress)}%</span>
        </div>
      </div>

      <div className="text-center space-y-1">
        <p className="text-sm font-semibold text-foreground">Gerando sua persona</p>
        <p className="text-xs text-muted-foreground min-h-[16px] transition-all">{label}</p>
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ChatWizard<T extends Record<string, unknown>>({
  moduleId,
  messages,
  onMessagesChange,
  onComplete,
  placeholder = "Digite sua mensagem...",
}: ChatWizardProps<T>) {
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [progress, setProgress] = useState(0)
  const pendingExtracted = useRef<T | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const openingFetched = useRef(false)

  // On mount (or when messages becomes empty): fetch the opening message once
  useEffect(() => {
    if (messages.length > 0) {
      openingFetched.current = true
      return
    }
    if (openingFetched.current) return
    openingFetched.current = true
    fetchOpening()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // When messages is reset to empty (reset button), fetch a fresh opening
  useEffect(() => {
    if (messages.length === 0 && openingFetched.current) {
      fetchOpening()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length])

  // Auto-scroll on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, loading])

  // Generation animation: 0→100% over ~2.5s
  useEffect(() => {
    if (!generating) return
    const interval = setInterval(() => {
      setProgress(p => {
        const next = p + 1.5
        if (next >= 100) {
          clearInterval(interval)
          // Small pause at 100% before transitioning
          setTimeout(() => {
            setGenerating(false)
            setProgress(0)
            if (pendingExtracted.current) {
              onComplete(pendingExtracted.current)
              pendingExtracted.current = null
            }
          }, 400)
          return 100
        }
        return next
      })
    }, 40)
    return () => clearInterval(interval)
  }, [generating, onComplete])

  const fetchOpening = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/chat/opening", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ moduleId }),
      })
      const { data, error: apiError } = await res.json()
      if (apiError) { setError(apiError.message); return }
      const turn = data as ChatTurnResponse
      onMessagesChange([{ role: "assistant", content: turn.message }])
    } catch {
      setError("Falha ao iniciar conversa.")
    } finally {
      setLoading(false)
    }
  }, [moduleId, onMessagesChange])

  async function sendMessage() {
    const text = input.trim()
    if (!text || loading || generating) return
    setInput("")
    setError(null)

    const userMsg: ChatMessage = { role: "user", content: text }
    const next = [...messages, userMsg]
    onMessagesChange(next)
    setLoading(true)

    try {
      const res = await fetch("/api/chat/turn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ moduleId, messages: next }),
      })
      const { data, error: apiError } = await res.json()
      if (apiError) { setError(apiError.message); return }
      const turn = data as ChatTurnResponse
      onMessagesChange([...next, { role: "assistant", content: turn.message }])
      if (turn.done && turn.extracted) {
        pendingExtracted.current = turn.extracted as T
        setGenerating(true)
        setProgress(0)
      }
    } catch {
      setError("Falha ao enviar mensagem. Tente novamente.")
    } finally {
      setLoading(false)
      inputRef.current?.focus()
    }
  }

  function reset() {
    openingFetched.current = false
    setInput("")
    setError(null)
    onMessagesChange([])
  }

  return (
    <div className="flex flex-col h-full min-h-[500px] relative">
      {/* Generation overlay */}
      {generating && <GeneratingOverlay progress={progress} />}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.map((msg, i) =>
          msg.role === "assistant"
            ? <AssistantBubble key={i} content={msg.content} />
            : <UserBubble key={i} content={msg.content} />
        )}
        {loading && <TypingIndicator />}
        {error && (
          <div className="text-center text-xs text-destructive py-2">{error}</div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t p-3 flex gap-2 items-end bg-background">
        <Textarea
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault()
              sendMessage()
            }
          }}
          placeholder={placeholder}
          className="resize-none min-h-[44px] max-h-[120px] text-sm"
          rows={1}
          disabled={loading || generating}
        />
        <div className="flex gap-1 shrink-0">
          <Button
            size="icon"
            variant="ghost"
            onClick={reset}
            disabled={loading || generating}
            title="Recomeçar"
            className="h-9 w-9"
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            onClick={sendMessage}
            disabled={loading || generating || !input.trim()}
            className="h-9 w-9"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
  )
}
