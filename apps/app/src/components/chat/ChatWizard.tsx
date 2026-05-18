"use client"

import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Loader2, Send, RotateCcw } from "lucide-react"
import type { ChatMessage, ChatTurnResponse, ModuleId } from "./types"

interface ChatWizardProps<T> {
  moduleId: ModuleId
  onComplete: (extracted: T) => void
  placeholder?: string
}

function AssistantBubble({ content }: { content: string }) {
  // Render **bold** markdown inline
  const parts = content.split(/(\*\*[^*]+\*\*)/)
  return (
    <div className="flex gap-3 items-start">
      <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-xs font-bold shrink-0">
        AI
      </div>
      <div className="bg-muted rounded-2xl rounded-tl-sm px-4 py-3 max-w-[80%] text-sm leading-relaxed">
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
      <div className="bg-primary text-primary-foreground rounded-2xl rounded-tr-sm px-4 py-3 max-w-[80%] text-sm leading-relaxed">
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

export function ChatWizard<T extends Record<string, unknown>>({
  moduleId,
  onComplete,
  placeholder = "Digite sua mensagem...",
}: ChatWizardProps<T>) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Load opening message on mount
  useEffect(() => {
    let cancelled = false
    async function loadOpening() {
      setLoading(true)
      try {
        const res = await fetch("/api/chat/opening", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ moduleId }),
        })
        const { data, error: apiError } = await res.json()
        if (cancelled) return
        if (apiError) { setError(apiError.message); return }
        const turn = data as ChatTurnResponse
        setMessages([{ role: "assistant", content: turn.message }])
      } catch {
        if (!cancelled) setError("Falha ao iniciar conversa.")
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    loadOpening()
    return () => { cancelled = true }
  }, [moduleId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, loading])

  async function sendMessage() {
    const text = input.trim()
    if (!text || loading) return
    setInput("")
    setError(null)

    const userMsg: ChatMessage = { role: "user", content: text }
    const next = [...messages, userMsg]
    setMessages(next)
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
      setMessages(prev => [...prev, { role: "assistant", content: turn.message }])
      if (turn.done && turn.extracted) {
        onComplete(turn.extracted as T)
      }
    } catch {
      setError("Falha ao enviar mensagem. Tente novamente.")
    } finally {
      setLoading(false)
      inputRef.current?.focus()
    }
  }

  function reset() {
    setMessages([])
    setInput("")
    setError(null)
    // re-trigger opening
    setLoading(true)
    fetch("/api/chat/opening", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ moduleId }),
    })
      .then(r => r.json())
      .then(({ data }) => {
        if (data) setMessages([{ role: "assistant", content: (data as ChatTurnResponse).message }])
      })
      .finally(() => setLoading(false))
  }

  return (
    <div className="flex flex-col h-full min-h-[500px]">
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
          disabled={loading}
        />
        <div className="flex gap-1 shrink-0">
          <Button
            size="icon"
            variant="ghost"
            onClick={reset}
            disabled={loading}
            title="Recomeçar"
            className="h-9 w-9"
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            onClick={sendMessage}
            disabled={loading || !input.trim()}
            className="h-9 w-9"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
  )
}
