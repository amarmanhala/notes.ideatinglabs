import { getAccessToken } from './authClient'
import { recordApiActivity } from './apiActivityStore'

export type SpeechPhase = 'connecting' | 'listening' | 'finishing' | 'idle'
export type SpeechResult = { text: string; refine: boolean; error: string }
type Callbacks = {
  phase: (phase: SpeechPhase) => void
  transcript: (text: string) => void
  levels: (levels: number[]) => void
  finish: (result: SpeechResult) => void
}
type SpeechEvent = { type: string; item_id?: string; previous_item_id?: string | null; delta?: string; transcript?: string; usage?: { total_tokens?: number }; error?: { code?: string; message?: string } }

// Completion events can arrive out of order; committed item predecessors define speech order.
export class TranscriptBuffer {
  private items = new Map<string, { text: string; previous?: string | null; done: boolean }>()
  tokens: number | undefined
  receive(event: SpeechEvent) {
    if (!event.item_id) return
    const item = this.items.get(event.item_id) ?? { text: '', done: false }
    if (event.type === 'input_audio_buffer.committed') item.previous = event.previous_item_id ?? null
    if (event.type === 'conversation.item.input_audio_transcription.delta' && !item.done) item.text += event.delta ?? ''
    if (event.type === 'conversation.item.input_audio_transcription.completed') {
      if (!item.done && typeof event.usage?.total_tokens === 'number' && Number.isFinite(event.usage.total_tokens) && event.usage.total_tokens >= 0) this.tokens = (this.tokens ?? 0) + event.usage.total_tokens
      item.text = event.transcript ?? item.text
      item.done = true
    }
    this.items.set(event.item_id, item)
  }
  get pending() { return [...this.items.values()].some(item => !item.done) }
  get text() {
    const ordered: string[] = []
    const visited = new Set<string>()
    const visit = (id: string) => {
      if (visited.has(id)) return
      visited.add(id)
      const item = this.items.get(id)!
      if (item.previous && this.items.has(item.previous)) visit(item.previous)
      if (item.text.trim()) ordered.push(item.text.trim())
    }
    for (const id of this.items.keys()) visit(id)
    return ordered.join(' ')
  }
}

export class SpeechTranscription {
  private callbacks: Callbacks
  private buffer = new TranscriptBuffer()
  private controller = new AbortController()
  private stream?: MediaStream
  private peer?: RTCPeerConnection
  private channel?: RTCDataChannel
  private context?: AudioContext
  private timers = new Set<ReturnType<typeof setTimeout>>()
  private frame = 0
  private done = false
  private stopping = false
  private commitAnswered = false
  private settleTimer?: ReturnType<typeof setTimeout>
  private id = crypto.randomUUID()
  private called = false
  private diagnosticState: 'success' | 'error' | 'cancelled' = 'success'
  private getToken: () => Promise<string>
  constructor(callbacks: Callbacks, getToken = getAccessToken) { this.callbacks = callbacks; this.getToken = getToken }
  private later(action: () => void, delay: number) {
    const timer = setTimeout(() => { this.timers.delete(timer); action() }, delay)
    this.timers.add(timer)
    return timer
  }
  private diagnostic(state: 'pending' | 'success' | 'error' | 'cancelled') {
    recordApiActivity({ id: this.id, label: 'OpenAI · Speech', state, tokens: this.buffer.tokens, response: this.buffer.text.slice(0, 500) || undefined })
  }
  async start() {
    this.callbacks.phase('connecting')
    this.later(() => { if (!this.channel || this.channel.readyState !== 'open') this.fail('Could not connect. Click the mic to try again.') }, 30_000)
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof RTCPeerConnection === 'undefined') throw new Error('Speaking is unavailable in this browser. You can keep typing.')
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false })
      if (this.done) { stream.getTracks().forEach(track => track.stop()); return }
      this.stream = stream
      for (const track of stream.getAudioTracks()) track.onended = () => { if (!this.stopping && !this.done) this.fail('Microphone disconnected. Your words have been kept.') }
      this.startMeter(stream)
      const apiBase = import.meta.env.VITE_API_BASE_URL ?? (import.meta.env.DEV ? '' : 'https://notes.ideatinglabs.com')
      this.called = true
      this.diagnostic('pending')
      const response = await fetch(`${apiBase.replace(/\/$/, '')}/api/speech/session`, {
        method: 'POST', headers: { Authorization: `Bearer ${await this.getToken()}` }, signal: this.controller.signal,
      })
      const session = await response.json()
      if (!response.ok) throw new Error(session.error || 'Could not connect. Click the mic to try again.')
      if (this.done) return
      if (typeof session.value !== 'string' || !session.value) throw new Error('Could not start speech transcription. Please try again.')
      const peer = new RTCPeerConnection()
      this.peer = peer
      stream.getAudioTracks().forEach(track => peer.addTrack(track, stream))
      const channel = peer.createDataChannel('oai-events')
      this.channel = channel
      channel.onmessage = message => {
        if (this.done) return
        try { this.receive(JSON.parse(message.data)) } catch { this.fail('Transcription was interrupted. Your words have been kept.') }
      }
      channel.onopen = () => {
        if (this.done || this.stopping) return
        this.callbacks.phase('listening')
        this.later(() => this.stop(), 5 * 60_000)
      }
      channel.onerror = () => this.fail('Connection lost. Your words have been kept. Click the mic to try again.')
      channel.onclose = () => { if (!this.done) this.fail('Connection lost. Your words have been kept. Click the mic to try again.') }
      peer.onconnectionstatechange = () => {
        if (!this.done && peer.connectionState === 'failed') this.fail('Connection lost. Your words have been kept. Click the mic to try again.')
      }
      const offer = await peer.createOffer()
      await peer.setLocalDescription(offer)
      const answer = await fetch('https://api.openai.com/v1/realtime/calls', {
        method: 'POST', body: offer.sdp, headers: { Authorization: `Bearer ${session.value}`, 'Content-Type': 'application/sdp' }, signal: this.controller.signal,
      })
      if (!answer.ok) throw new Error('Could not connect. Click the mic to try again.')
      const sdp = await answer.text()
      if (!this.done) await peer.setRemoteDescription({ type: 'answer', sdp })
    } catch (error) {
      if (this.done) return
      const name = error instanceof Error ? error.name : ''
      this.fail(name === 'NotAllowedError' ? 'Microphone access is blocked. Allow it in your browser and try again.' : name === 'NotFoundError' ? 'No microphone found. Connect one and try again.' : name === 'NotReadableError' ? 'Your microphone is busy. Close other apps using it and try again.' : error instanceof Error ? error.message : 'Could not connect. Click the mic to try again.')
    }
  }
  private receive(event: SpeechEvent) {
    if (!event || typeof event.type !== 'string') { this.fail('Transcription was interrupted. Your words have been kept.'); return }
    if (event.type.startsWith('conversation.item.input_audio_transcription.') &&
      (typeof event.item_id !== 'string' ||
        (event.type.endsWith('.delta') && typeof event.delta !== 'string') ||
        (event.type.endsWith('.completed') && typeof event.transcript !== 'string'))) {
      this.fail('Transcription was interrupted. Your words have been kept.'); return
    }
    if (event.type === 'error') {
      if (this.stopping && event.error?.code === 'input_audio_buffer_commit_empty') { this.commitAnswered = true; this.maybeFinish(); return }
      this.fail('Transcription was interrupted. Your words have been kept. Click the mic to try again.')
      return
    }
    if (event.type === 'conversation.item.input_audio_transcription.failed') { this.fail('Some speech could not be transcribed. Your words have been kept.'); return }
    if (['input_audio_buffer.committed', 'input_audio_buffer.speech_started', 'conversation.item.input_audio_transcription.delta', 'conversation.item.input_audio_transcription.completed'].includes(event.type)) {
      this.buffer.receive(event)
      if (event.type === 'input_audio_buffer.committed' && this.stopping) this.commitAnswered = true
      this.callbacks.transcript(this.buffer.text)
      this.maybeFinish()
    }
  }
  stop() {
    if (this.done || this.stopping) return
    this.stopping = true
    this.stopCapture()
    if (this.channel?.readyState !== 'open') { this.diagnosticState = 'cancelled'; this.finish(false, ''); return }
    this.callbacks.phase('finishing')
    // Let the last RTP packets drain before committing the remaining audio.
    this.later(() => {
      if (!this.done && this.channel?.readyState === 'open') this.channel.send(JSON.stringify({ type: 'input_audio_buffer.commit' }))
    }, 250)
    this.later(() => { this.diagnosticState = 'error'; this.finish(false, 'Transcription timed out. Your words have been kept. Click the mic to try again.') }, 15_000)
  }
  cancel() {
    if (this.done) return
    this.diagnosticState = 'cancelled'
    this.finish(false, '')
  }
  private maybeFinish() {
    if (this.settleTimer) { clearTimeout(this.settleTimer); this.timers.delete(this.settleTimer) }
    if (this.stopping && this.commitAnswered && !this.buffer.pending) this.settleTimer = this.later(() => this.finish(true, this.buffer.text ? '' : 'No speech heard. Click the mic to try again.'), 400)
  }
  private fail(message: string) { if (!this.done) { this.diagnosticState = 'error'; this.finish(false, message) } }
  private finish(refine: boolean, error: string) {
    if (this.done) return
    this.done = true
    this.stopCapture()
    this.controller.abort()
    for (const timer of this.timers) clearTimeout(timer)
    this.timers.clear()
    this.channel?.close()
    this.peer?.close()
    if (this.called) this.diagnostic(this.diagnosticState)
    this.callbacks.phase('idle')
    this.callbacks.finish({ text: this.buffer.text, refine, error })
  }
  private stopCapture() {
    this.stream?.getTracks().forEach(track => { track.onended = null; track.stop() })
    cancelAnimationFrame(this.frame)
    void this.context?.close().catch(() => {})
    this.context = undefined
    this.callbacks.levels([0, 0, 0, 0, 0])
  }
  private startMeter(stream: MediaStream) {
    // Transcription still works when Web Audio is unavailable.
    try {
      const context = new AudioContext()
      this.context = context
      void context.resume().catch(() => {})
      const analyser = context.createAnalyser()
      analyser.fftSize = 256
      analyser.smoothingTimeConstant = 0.7
      context.createMediaStreamSource(stream).connect(analyser)
      const data = new Uint8Array(analyser.frequencyBinCount)
      let last = 0
      const measure = (now: number) => {
        if (this.done || this.stopping) return
        if (now - last > 80) {
          last = now
          analyser.getByteFrequencyData(data)
          this.callbacks.levels([0, 1, 2, 3, 4].map(index => {
            const from = 2 + index * 6
            return Math.min(1, data.slice(from, from + 12).reduce((sum, value) => sum + value, 0) / (12 * 180))
          }))
        }
        this.frame = requestAnimationFrame(measure)
      }
      this.frame = requestAnimationFrame(measure)
    } catch { /* A static waveform is sufficient without Web Audio. */ }
  }
}
