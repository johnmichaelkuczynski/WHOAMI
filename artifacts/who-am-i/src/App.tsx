import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { QueryClientProvider, useIsMutating, useQueryClient } from '@tanstack/react-query';
import {
  Activity, ArrowDownToLine, ArrowRight, BookOpen, Check, CheckCircle2,
  ChevronLeft, ChevronRight, Compass, FileText, Heart, Lightbulb, Mic, MicOff,
  LoaderCircle, MessageCircle, Plus, Send, Sparkles, UserRound, Waves, X,
} from 'lucide-react';
import { Link, Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import {
  getGetCareerProfileQueryKey, getGetDiscoveryDashboardQueryKey,
  getListAssessmentResultsQueryKey, getListCareerConversationsQueryKey,
  getListCareerMessagesQueryKey, getListCareerRecommendationsQueryKey,
  useCreateCareerConversation, useGenerateCareerRecommendations, sendCareerMessage,
  useGetCareerProfile, useGetDiscoveryDashboard, useListAssessmentResults,
  useListCareerConversations, useListCareerMessages, useListCareerRecommendations,
  useSendCareerMessage, useStartAssessment, useSubmitAssessment,
  useSummarizeCareerConversation, useUpdateCareerProfile, useUpdateCareerRecommendation,
  useStartFreshDiscovery,
} from '@workspace/api-client-react';
import type { AssessmentSession, CareerRecommendation } from '@workspace/api-client-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { AssessmentDownloads } from '@/components/assessment-downloads';
import { retryChatRequest } from '@/lib/chat-request';
import { createQueryClient } from '@/lib/query-client';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import TestsPage from '@/pages/tests';
import AuthGate, { useAuth } from '@/components/auth-gate';
const queryClient = createQueryClient();
const navItems = [
  { href: '/', label: 'Conversation' },
  { href: '/assessments', label: 'Diagnostic tests' },
  { href: '/check-ins', label: 'Short check-ins' },
  { href: '/profile', label: 'Your profile' },
  { href: '/recommendations', label: 'Books & activities' },
];
const dateLabel = (value?: string) => value ? new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(new Date(value)) : 'Just now';
const messageOf = (error: unknown) => error instanceof Error ? error.message : 'Something went wrong. Please try again.';
const NEW_CONVERSATION_EVENT = 'who-am-i:new-conversation';
const openBlankConversation = () => { window.dispatchEvent(new Event(NEW_CONVERSATION_EVENT)); };

function FreshStart() {
  const qc = useQueryClient();
  const reset = useStartFreshDiscovery();
  const mutations = useIsMutating();
  const [error, setError] = useState('');
  const start = async () => {
    setError('');
    try {
      await reset.mutateAsync();
      await qc.cancelQueries();
      qc.clear();
      window.location.assign(import.meta.env.BASE_URL);
    } catch (cause) {
      setError(messageOf(cause));
    }
  };
  return <section className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3">
    <div><p className="text-xs font-semibold">Want to begin again?</p><p className="mt-1 max-w-xl text-[11px] text-muted-foreground">Start fresh resets your profile, test results, suggestions and chat context. Past chats stay saved and readable. You stay signed in.</p>{error && <p role="alert" className="mt-2 text-xs text-destructive">{error}</p>}</div>
    <Button secondary testId="button-start-fresh" onClick={() => void start()} disabled={mutations > 0}>{reset.isPending ? 'Starting fresh…' : 'Start fresh'}</Button>
  </section>;
}

function Shell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const activeLocation = location === '/tests' ? '/assessments' : location;
  const { user, signOut } = useAuth();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => localStorage.getItem('who-am-i-sidebar-collapsed-v2') !== 'false',
  );
  const current = navItems.find(item => item.href === activeLocation)?.label ?? 'Conversation';
  useEffect(() => {
    localStorage.setItem('who-am-i-sidebar-collapsed-v2', String(sidebarCollapsed));
  }, [sidebarCollapsed]);
  return <div className="app-shell flex bg-background text-foreground">
    <aside className={`hidden shrink-0 flex-col border-r border-border bg-[hsl(var(--sidebar))] py-6 transition-[width,padding] duration-200 md:flex ${sidebarCollapsed ? 'w-[160px] px-2' : 'w-[230px] px-5'}`}>
      <div className={`mb-9 flex w-full ${sidebarCollapsed ? 'flex-col items-center gap-3' : 'items-center justify-between gap-3'}`}>
        <Link href="/" className={`flex min-w-0 items-center gap-3 no-underline ${sidebarCollapsed ? 'justify-center' : ''}`} data-testid="link-brand" aria-label="Who Am I? home">
          <span><span className="block text-sm font-semibold tracking-tight">Who Am I?</span>{!sidebarCollapsed && <span className="mono-label text-[9px] text-muted-foreground">A CAREER FIELD GUIDE</span>}</span>
        </Link>
        <button
          type="button"
          onClick={() => setSidebarCollapsed(value => !value)}
          aria-label={sidebarCollapsed ? 'Expand navigation panel' : 'Collapse navigation panel'}
          aria-expanded={!sidebarCollapsed}
          data-testid="button-toggle-sidebar"
          className="shrink-0 rounded-lg px-2 py-2 text-[10px] text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
        >
          {sidebarCollapsed ? 'Expand menu' : 'Compact'}
        </button>
      </div>
      {!sidebarCollapsed && <p className="mono-label mb-3 px-2 text-[9px] text-muted-foreground">YOUR SPACE</p>}
      <nav className={`w-full space-y-1 ${sidebarCollapsed ? 'px-1' : ''}`} aria-label="Main navigation">
        {navItems.map(({ href, label }) => <Link key={href} href={href}
          onClick={href === '/' ? openBlankConversation : undefined}
          aria-label={label}
          title={sidebarCollapsed ? label : undefined}
          aria-current={activeLocation === href ? 'page' : undefined}
          className={`flex items-center rounded-lg px-3 py-3 text-[13px] transition-colors ${activeLocation === href ? 'bg-card font-semibold text-primary shadow-sm' : 'text-muted-foreground hover:bg-card/70 hover:text-foreground'}`}
          data-testid={`link-nav-${label.toLowerCase().replaceAll(' ', '-')}`}><span>{label}</span></Link>)}
      </nav>
      {!sidebarCollapsed && <div className="mt-auto rounded-xl border border-border/80 bg-card/70 p-4">
        <div className="mb-2 flex items-center gap-2 text-primary"><Sparkles size={15}/><span className="mono-label text-[9px]">A NOTE TO SELF</span></div>
        <p className="serif-display text-[19px] leading-[1.15] text-foreground">You don't need the whole map. Just the next honest step.</p>
      </div>}
    </aside>
    <main className="min-w-0 flex-1">
      <header className="sticky top-0 z-20 flex h-[58px] items-center justify-between border-b border-border/80 bg-background/95 px-4 backdrop-blur md:px-8">
        <div className="flex items-center gap-2 md:hidden"><span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground"><Waves size={16}/></span><span className="text-sm font-semibold">Who Am I?</span></div>
        <div className="hidden text-xs text-muted-foreground md:block">A quieter place to figure out what fits.</div>
        <div className="flex items-center gap-3"><span className="hidden max-w-[180px] truncate text-[10px] text-muted-foreground sm:inline" title={user.development ? 'Replit development account' : user.email}>{user.development ? 'Development preview' : user.email}</span>{!user.development && <button type="button" onClick={() => void signOut()} aria-label="Sign out" title="Sign out" className="text-[10px] font-semibold text-primary hover:underline">Sign out</button>}<span className="hidden items-center gap-2 sm:flex"><span className="size-2 rounded-full bg-[#82a990]"/><span className="text-[11px] text-muted-foreground">Private by design</span></span></div>
      </header>
      <div className="mx-auto max-w-[1240px] px-4 pb-24 pt-6 md:px-8 md:pb-10 md:pt-9">
        <div className="mb-5 flex items-center justify-between md:hidden"><span className="mono-label text-[10px] text-muted-foreground">{current.toUpperCase()}</span><span className="text-[11px] text-muted-foreground">Your space</span></div>
        <FreshStart/>
        {children}
      </div>
      <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-border bg-background/95 px-2 pb-[max(8px,env(safe-area-inset-bottom))] pt-2 backdrop-blur md:hidden" aria-label="Mobile navigation">
        {navItems.map(({ href, label }) => <Link key={href} href={href} onClick={href === '/' ? openBlankConversation : undefined} aria-current={activeLocation === href ? 'page' : undefined} className={`flex min-h-10 flex-1 items-center justify-center rounded-md px-1 py-1 text-center text-[10px] font-semibold leading-4 ${activeLocation === href ? 'bg-secondary text-primary' : 'text-muted-foreground'}`} data-testid={`mobile-nav-${href.slice(1) || 'home'}`}>{label}</Link>)}
      </nav>
    </main>
  </div>;
}

function SectionHeading({ eyebrow, title, children }: { eyebrow: string; title: string; children?: ReactNode }) {
  return <div className="mb-6 flex flex-wrap items-end justify-between gap-4"><div><p className="mono-label mb-2 text-[9px] text-primary">{eyebrow}</p><h1 className="serif-display text-[36px] leading-none tracking-[-.02em] md:text-[44px]">{title}</h1></div>{children}</div>;
}
function Button({ children, onClick, disabled, secondary = false, testId, type = 'button' }: { children: ReactNode; onClick?: () => void; disabled?: boolean; secondary?: boolean; testId: string; type?: 'button' | 'submit' }) {
  return <button type={type} onClick={onClick} disabled={disabled} data-testid={testId} className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-[12px] font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-50 ${secondary ? 'border border-border bg-card text-foreground hover:border-primary/40 hover:bg-secondary/60' : 'bg-primary text-primary-foreground hover:brightness-95'}`}>{children}</button>;
}
function QueryError({ error, retry }: { error: unknown; retry: () => void }) {
  return <div className="rounded-xl border border-destructive/25 bg-destructive/5 p-5" role="alert"><p className="text-sm font-medium">This part didn't load.</p><p className="mt-1 text-xs text-muted-foreground">{messageOf(error)}</p><button onClick={retry} data-testid="button-retry" className="mt-3 text-xs font-semibold text-primary underline underline-offset-4">Try again</button></div>;
}
function Skeleton({ rows = 3 }: { rows?: number }) { return <div className="animate-pulse space-y-3" aria-label="Loading"><div className="h-5 w-1/3 rounded bg-secondary"/>{Array.from({ length: rows }, (_, i) => <div key={i} className="h-14 rounded-xl bg-secondary/70"/>)}</div>; }
function Empty({ icon: Icon, title, body }: { icon: typeof Compass; title: string; body: string }) {
  return <div className="soft-paper flex min-h-[170px] flex-col items-center justify-center rounded-xl border border-dashed border-border px-5 text-center"><span className="mb-3 grid size-9 place-items-center rounded-full bg-card text-primary"><Icon size={18}/></span><p className="serif-display text-[22px]">{title}</p><p className="mt-1 max-w-sm text-xs leading-5 text-muted-foreground">{body}</p></div>;
}

function HomePage() {
  const qc = useQueryClient();
  const dash = useGetDiscoveryDashboard();
  const conversations = useListCareerConversations();
  const recommendations = useListCareerRecommendations();
  const create = useCreateCareerConversation();
  const generateRecommendations = useGenerateCareerRecommendations();
  const [activeId, setActiveId] = useState<number | null>(null);
  const conversationList = conversations.data ?? [];
  const active = conversationList.find(c => c.id === activeId);
  const activeConversationId = active?.id;
  const messages = useListCareerMessages(activeConversationId as number, { query: { enabled: !!activeConversationId, queryKey: getListCareerMessagesQueryKey(activeConversationId as number) } });
  const pendingRequestRef = useRef<{ id: number; content: string; key: string } | null>(null);
  const send = useSendCareerMessage({
    mutation: {
      mutationFn: ({ id, data }) => sendCareerMessage(id, data, {
        headers: { 'Idempotency-Key': pendingRequestRef.current!.key },
        signal: AbortSignal.timeout(90_000),
      }),
    },
  });
  const summarize = useSummarizeCareerConversation();
  const [draft, setDraft] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [notice, setNotice] = useState('');
  const [savedSummary, setSavedSummary] = useState('');
  const [recommendationNotice, setRecommendationNotice] = useState('');
  const sendingRef = useRef(false);
  const [voiceState, setVoiceState] = useState<'idle' | 'recording' | 'transcribing'>('idle');
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop();
      streamRef.current?.getTracks().forEach(track => track.stop());
    };
  }, []);
  const transcribeRecording = async (blob: Blob) => {
    if (!blob.size) {
      setVoiceState('idle');
      setNotice('No audio was captured. Try recording again.');
      return;
    }
    setVoiceState('transcribing');
    try {
      const response = await fetch('/api/discovery/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': blob.type || 'application/octet-stream' },
        body: blob,
      });
      const result = await response.json() as { text?: string; error?: string };
      if (!response.ok) throw new Error(result.error || 'Transcription failed. Try again.');
      const transcript = result.text?.trim();
      if (!transcript) {
        setNotice('I couldn’t make out any words. Try recording again a little closer to the microphone.');
        return;
      }
      setDraft(previous => `${previous.trimEnd()}${previous.trim() ? ' ' : ''}${transcript}`);
      setNotice('');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Transcription failed. Check your connection and try again.');
    } finally {
      setVoiceState('idle');
    }
  };
  const toggleRecording = async () => {
    if (voiceState === 'recording') {
      recorderRef.current?.stop();
      return;
    }
    if (voiceState === 'transcribing') return;
    setNotice('');
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setNotice('This browser cannot record audio here. Use a current browser over a secure connection, or type your message.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const supportedTypes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
      const mimeType = supportedTypes.find(type => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = event => {
        if (event.data.size) chunksRef.current.push(event.data);
      };
      recorder.onerror = () => {
        stream.getTracks().forEach(track => track.stop());
        streamRef.current = null;
        recorderRef.current = null;
        setVoiceState('idle');
        setNotice('Audio recording stopped unexpectedly. Check microphone access and try again.');
      };
      recorder.onstop = () => {
        const recording = new Blob(chunksRef.current, { type: recorder.mimeType || chunksRef.current[0]?.type || 'application/octet-stream' });
        chunksRef.current = [];
        stream.getTracks().forEach(track => track.stop());
        streamRef.current = null;
        recorderRef.current = null;
        if (mountedRef.current) void transcribeRecording(recording);
      };
      recorder.start(1000);
      setVoiceState('recording');
    } catch (error) {
      streamRef.current?.getTracks().forEach(track => track.stop());
      streamRef.current = null;
      setVoiceState('idle');
      const name = error instanceof DOMException ? error.name : '';
      setNotice(name === 'NotAllowedError' || name === 'PermissionDeniedError'
        ? 'Microphone access is blocked. Allow microphone access in your browser settings and try again.'
        : name === 'NotFoundError'
          ? 'No microphone was found. Connect or enable a microphone and try again.'
          : 'The microphone could not be started. Check browser permission and try again.');
    }
  };
  const refresh = () => { void qc.invalidateQueries({ queryKey: getGetDiscoveryDashboardQueryKey() }); void qc.invalidateQueries({ queryKey: getListCareerConversationsQueryKey() }); };
  const startConversation = async (title: string) => {
    const conversation = await create.mutateAsync({ data: { title: title.trim() || 'A new reflection' } });
    setActiveId(conversation.id); setShowNew(false); setNewTitle(''); setNotice('');
    await qc.invalidateQueries({ queryKey: getListCareerConversationsQueryKey() });
    return conversation;
  };
  const handleSend = async (event: FormEvent) => {
    event.preventDefault();
    const content = draft.trim();
    if (!content || sendingRef.current || active?.archived) return;
    sendingRef.current = true;
    setNotice('');
    try {
      let conversation = active;
      if (!conversation) conversation = await startConversation(content.split(/[.!?]/)[0].slice(0, 48) || 'A new reflection');
      if (pendingRequestRef.current?.id !== conversation.id || pendingRequestRef.current.content !== content) {
        pendingRequestRef.current = { id: conversation.id, content, key: crypto.randomUUID() };
      }
      const result = await retryChatRequest(
        () => send.mutateAsync({ id: conversation.id, data: { content } }),
        () => setNotice('Connection interrupted. Reconnecting safely—your message is still here.'),
      );
      qc.setQueryData(getListCareerMessagesQueryKey(conversation.id), (old: typeof messages.data) => {
        const additions = [result.userMessage, result.assistantMessage];
        return [...(old ?? []).filter(message => !additions.some(next => next.id === message.id)), ...additions];
      });
      setDraft(current => current.trim() === content ? '' : current);
      pendingRequestRef.current = null;
      setNotice('');
      refresh();
    } catch (error) {
      setNotice(error instanceof TypeError || (error instanceof Error && error.name === 'TimeoutError')
        ? 'The connection could not be restored. Your message has been kept. Press Send to retry safely.'
        : messageOf(error));
    } finally {
      sendingRef.current = false;
    }
  };
  const exportChat = () => {
    const lines = (messages.data ?? []).map(m => `${m.role === 'user' ? 'You' : 'Who Am I?'}\n${m.content}`).join('\n\n');
    const file = new Blob([`${active?.title ?? 'Reflection'}\n${new Date().toLocaleDateString()}\n\n${lines}`], { type: 'text/plain' });
    const url = URL.createObjectURL(file); const a = document.createElement('a'); a.href = url; a.download = `${(active?.title ?? 'reflection').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.txt`; a.click(); URL.revokeObjectURL(url);
  };
  const saveSummary = async () => { if (!active) return; setNotice(''); try { const result = await summarize.mutateAsync({ id: active.id }); setSavedSummary(result.summary); await qc.invalidateQueries({ queryKey: getGetCareerProfileQueryKey() }); await qc.invalidateQueries({ queryKey: getListCareerConversationsQueryKey() }); await qc.invalidateQueries({ queryKey: getGetDiscoveryDashboardQueryKey() }); setNotice('Reflection added to your profile.'); } catch (error) { setNotice(messageOf(error)); } };
  const chatLoading = !active && conversations.isLoading;
  const newConversation = useCallback(() => {
    if (sendingRef.current || voiceState !== 'idle') {
      setNotice('Let the current reply or voice recording finish before opening a new conversation.');
      return;
    }
    setActiveId(null); setDraft(''); setNotice(''); setSavedSummary('');
    setShowNew(false); pendingRequestRef.current = null;
  }, [voiceState]);
  useEffect(() => {
    window.addEventListener(NEW_CONVERSATION_EVENT, newConversation);
    return () => window.removeEventListener(NEW_CONVERSATION_EVENT, newConversation);
  }, [newConversation]);
  return <div className="fade-up">
    <SectionHeading eyebrow="A MOMENT TO THINK" title="What’s on your mind?">
      <div className="flex flex-wrap gap-2"><Button secondary testId="button-new-blank-conversation" onClick={newConversation} disabled={send.isPending || create.isPending || voiceState !== 'idle'}>New conversation</Button>{active && <><Button secondary testId="button-export-chat" onClick={exportChat}><ArrowDownToLine size={14}/>Export</Button><Button secondary testId="button-summarize-chat" onClick={saveSummary} disabled={summarize.isPending || active.archived}>{summarize.isPending ? <LoaderCircle size={14} className="animate-spin"/> : <FileText size={14}/>}Save a summary</Button></>}</div>
    </SectionHeading>
    {(savedSummary || active?.summary) && <section className="mb-5 rounded-xl border border-primary/15 bg-[hsl(152_24%_91%)] px-5 py-4" data-testid="text-saved-chat-summary"><p className="mono-label mb-2 text-[9px] text-primary">A SUMMARY TO KEEP</p><p className="text-[12px] leading-6 text-foreground">{savedSummary || active?.summary}</p></section>}
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_275px]">
      <section className="flex min-h-[560px] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-[0_12px_38px_-32px_hsl(218_23%_20%/.35)] md:min-h-[calc(100dvh-190px)]">
        <div className="flex min-h-[57px] items-center justify-between border-b border-border px-4 md:px-6">
          <div className="flex min-w-0 items-center gap-3"><span className="grid size-8 shrink-0 place-items-center rounded-full bg-[hsl(152_26%_88%)] text-primary"><Waves size={16}/></span><div className="min-w-0"><p className="truncate text-[13px] font-semibold" data-testid="text-active-conversation">{active?.title ?? 'A new beginning'}</p><p className="text-[10px] text-muted-foreground">A thoughtful space, just for you</p></div></div>
          <div className="flex gap-1"><button onClick={newConversation} disabled={send.isPending || create.isPending || voiceState !== 'idle'} data-testid="button-new-conversation" className="rounded-lg px-2 py-2 text-[11px] text-primary hover:bg-secondary disabled:opacity-40">New conversation</button></div>
        </div>
        {showNew && <form className="flex gap-2 border-b border-border bg-secondary/30 px-4 py-3 md:px-6" onSubmit={async e => { e.preventDefault(); try { await startConversation(newTitle); } catch (error) { setNotice(messageOf(error)); } }}><input value={newTitle} onChange={e => setNewTitle(e.target.value)} autoFocus placeholder="Give this reflection a name" data-testid="input-conversation-title" className="min-w-0 flex-1 rounded-lg border border-border bg-card px-3 py-2 text-xs outline-none focus:border-primary"/><Button type="submit" testId="button-create-conversation" disabled={create.isPending}>{create.isPending ? 'Starting…' : 'Start'}</Button><button type="button" onClick={() => setShowNew(false)} data-testid="button-cancel-conversation" className="grid size-9 place-items-center text-muted-foreground"><X size={15}/></button></form>}
        <div className="flex-1 space-y-5 overflow-y-auto px-4 py-6 md:px-8 md:py-8" data-testid="list-chat-messages">
          {chatLoading || messages.isLoading ? <Skeleton rows={4}/> : messages.isError ? <QueryError error={messages.error} retry={() => void messages.refetch()}/> : !active || !messages.data?.length ? <div className="flex min-h-[180px] flex-col justify-center py-2"><p className="mono-label mb-1.5 text-[8px] text-primary">START WHERE YOU ARE</p><p className="serif-display max-w-lg text-[23px] leading-tight md:text-[26px]">You can bring the uncertainty, too.</p><p className="mt-2 max-w-lg text-[11px] leading-[1.55] text-muted-foreground">Tell me what’s shifting, what you’re curious about, or what a good workday feels like. We’ll find the thread together.</p><div className="mt-4 grid grid-cols-2 gap-1.5 lg:grid-cols-3">{['I’m not sure what I want next', 'When do I feel most like myself at work?', 'Help me make sense of a recent win', 'What kind of work gives me energy?', 'What do people come to me for?', 'Tell me about a time I felt proud of my work', 'What drains me, even when I’m good at it?', 'What would I try if I could not fail?'].map((prompt, i) => <button key={prompt} onClick={() => setDraft(prompt)} data-testid={`button-prompt-${i}`} className="flex min-h-9 w-full items-center justify-center rounded-xl border border-border bg-background px-2 py-1.5 text-center text-[9px] leading-[1.35] text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary">{prompt}</button>)}</div></div> : messages.data.map(message => <div key={message.id} className={`flex gap-3 ${message.role === 'user' ? 'flex-row-reverse' : ''}`} data-testid={`message-${message.id}`}><span className={`mt-0.5 grid size-7 shrink-0 place-items-center rounded-full ${message.role === 'user' ? 'bg-[hsl(14_45%_91%)] text-[hsl(14_41%_35%)]' : 'bg-[hsl(152_26%_88%)] text-primary'}`}>{message.role === 'user' ? <UserRound size={14}/> : <Waves size={14}/>}</span><div className={`max-w-[88%] rounded-2xl px-4 py-3 md:max-w-[78%] ${message.role === 'user' ? 'bg-secondary text-foreground' : 'bg-background'}`}><p className="message-copy text-[13px] leading-[1.75]">{message.content}</p><time className="mt-2 block text-[9px] text-muted-foreground">{dateLabel(message.createdAt)}</time></div></div>)}
          {send.isPending && <div className="flex items-center gap-3 text-xs text-muted-foreground"><span className="grid size-7 place-items-center rounded-full bg-secondary text-primary"><Waves size={14}/></span><span className="animate-pulse">Finding the right words…</span></div>}
        </div>
        {notice && <div className="mx-4 mb-2 flex items-center justify-between rounded-lg bg-accent px-3 py-2 text-xs text-accent-foreground md:mx-6" role="status"><span data-testid="status-chat">{notice}</span><button onClick={() => setNotice('')} data-testid="button-dismiss-notice"><X size={13}/></button></div>}
        <form onSubmit={handleSend} className="border-t border-border bg-card px-3 py-3 md:px-6 md:py-4">
          {active?.archived && <p className="mb-3 text-xs text-muted-foreground" data-testid="text-archived-chat">Saved past chat — read or export it here. Choose New conversation to write without bringing back its context.</p>}
          <fieldset disabled={active?.archived} className="min-w-0">
          <div className="flex items-end gap-2 rounded-xl border border-border bg-background p-2 focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-primary/10"><textarea value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }} placeholder="Write as much or as little as you need…" rows={12} data-testid="input-chat-message" className="max-h-[480px] min-h-[288px] flex-1 resize-y bg-transparent px-2 py-1.5 text-[13px] leading-6 outline-none placeholder:text-muted-foreground/70"/><button type="button" onClick={() => void toggleRecording()} aria-label={voiceState === 'recording' ? 'Stop voice recording' : voiceState === 'transcribing' ? 'Transcribing voice input' : 'Start voice recording'} aria-pressed={voiceState === 'recording'} title={voiceState === 'recording' ? 'Stop and transcribe' : voiceState === 'transcribing' ? 'Transcribing…' : 'Record a message'} disabled={voiceState === 'transcribing'} data-testid="button-voice-input" className={`mb-1 grid size-9 shrink-0 place-items-center rounded-lg transition-colors disabled:opacity-50 ${voiceState === 'recording' ? 'bg-destructive/10 text-destructive' : 'text-muted-foreground hover:bg-secondary hover:text-primary'}`}>{voiceState === 'transcribing' ? <LoaderCircle size={16} className="animate-spin"/> : voiceState === 'recording' ? <MicOff size={16}/> : <Mic size={16}/>}</button><button type="submit" disabled={!draft.trim() || send.isPending || create.isPending} data-testid="button-send-message" aria-label="Send reflection" className="mb-1 grid size-9 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground transition-opacity disabled:opacity-40"><Send size={16}/></button></div><div className="mt-2 flex items-center justify-between px-1 text-[9px] text-muted-foreground"><span>{voiceState === 'recording' ? 'Recording… Tap the microphone to stop and transcribe.' : voiceState === 'transcribing' ? 'Transcribing your recording…' : 'Enter to send · Shift + Enter for a new line'}</span><span>Not a test. No wrong answers.</span></div>
          </fieldset>
        </form>
      </section>
      <aside className="space-y-4">
        <div className="rounded-2xl border border-border bg-[hsl(36_40%_94%)] p-5"><p className="mono-label text-[9px] text-primary">YOUR JOURNEY, SO FAR</p>{dash.isLoading ? <div className="mt-4"><Skeleton rows={2}/></div> : dash.isError ? <QueryError error={dash.error} retry={() => void dash.refetch()}/> : <><p className="serif-display mt-3 text-[27px] leading-tight" data-testid="text-dashboard-summary">{dash.data?.latestSummary || dash.data?.profile.summary || 'A picture is taking shape.'}</p><div className="mt-5 grid grid-cols-3 gap-2 border-t border-border/70 pt-4">{[['Reflections', dash.data?.conversationCount ?? 0], ['Check-ins', dash.data?.assessmentCount ?? 0], ['Ideas', dash.data?.recommendationCount ?? 0]].map(([label, count]) => <div key={label}><p className="serif-display text-[24px]">{count}</p><p className="text-[9px] text-muted-foreground">{label}</p></div>)}</div></>}</div>
        <div className="rounded-2xl border border-border bg-card p-5"><div className="mb-4 flex items-center justify-between"><p className="mono-label text-[9px] text-muted-foreground">PAST CHATS</p></div><p className="mb-3 text-[11px] text-muted-foreground">Chats are saved automatically to your signed-in account. Chats from before a fresh start are read-only.</p>{conversations.isLoading ? <Skeleton rows={2}/> : conversations.isError ? <QueryError error={conversations.error} retry={() => void conversations.refetch()}/> : conversationList.length === 0 ? <p className="text-xs leading-5 text-muted-foreground">Your conversations will appear here.</p> : <div className="max-h-96 space-y-1 overflow-y-auto">{conversationList.map(c => <button key={c.id} disabled={send.isPending || create.isPending || voiceState !== 'idle'} onClick={() => { setActiveId(c.id); setDraft(''); setNotice(''); setSavedSummary(''); pendingRequestRef.current = null; }} data-testid={`button-select-conversation-${c.id}`} className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left disabled:opacity-50 ${active?.id === c.id ? 'bg-secondary/70' : 'hover:bg-secondary/50'}`}><span className="min-w-0 text-[11px] font-medium">{c.title}{c.archived && <span className="mt-1 block text-[9px] text-muted-foreground">Before fresh start</span>}</span><span className="shrink-0 text-[9px] text-muted-foreground">{dateLabel(c.updatedAt)}</span></button>)}</div>}</div>
        <div className="flex items-start gap-3 rounded-xl border border-border/70 bg-card/60 p-4"><Lightbulb size={16} className="mt-0.5 shrink-0 text-[#c58b43]"/><p className="text-[11px] leading-5 text-muted-foreground">Your profile grows from what you share. Summarize a conversation to keep the insights that matter.</p></div>
      </aside>
    </div>
    <section className="mt-6 rounded-2xl border border-border bg-card p-5 md:p-7" data-testid="recommendation-console">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><p className="mono-label text-[9px] text-primary">OUTSIDE THE CONVERSATION</p><h2 className="serif-display mt-1 text-[26px]">Books and activities to explore</h2><p className="mt-1 text-[11px] text-muted-foreground">A separate list of practical next steps, saved in Field notes.</p></div>
        <div className="flex items-center gap-3"><Link href="/recommendations" className="text-[11px] font-semibold text-primary underline underline-offset-4">View Field notes</Link><Button testId="button-home-generate-recommendations" disabled={generateRecommendations.isPending} onClick={() => { setRecommendationNotice(''); generateRecommendations.mutate(undefined, { onSuccess: async () => { await qc.invalidateQueries({ queryKey: getListCareerRecommendationsQueryKey() }); }, onError: error => setRecommendationNotice(messageOf(error)) }); }}>{generateRecommendations.isPending ? <LoaderCircle size={14} className="animate-spin"/> : <Sparkles size={14}/>}Find fresh ideas</Button></div>
      </div>
      {recommendationNotice && <p role="status" className="mt-3 text-xs text-destructive">{recommendationNotice}</p>}
      {recommendations.isLoading ? <div className="mt-4"><Skeleton rows={2}/></div> : recommendations.isError ? <div className="mt-4"><QueryError error={recommendations.error} retry={() => void recommendations.refetch()}/></div> : !recommendations.data?.length ? <p className="mt-4 text-xs text-muted-foreground">Generate ideas when you’re ready. They’ll stay separate from your chat.</p> : <div className="mt-4 grid gap-2 md:grid-cols-2">{recommendations.data.slice(0, 4).map(item => <article key={item.id} className="rounded-xl border border-border bg-background p-4" data-testid={`home-recommendation-${item.id}`}><p className="mono-label text-[8px] text-primary">{item.kind === 'book' ? 'BOOK' : 'ACTIVITY'}</p><h3 className="serif-display mt-1 text-[20px]">{item.title}</h3><p className="mt-1 text-[11px] leading-5 text-muted-foreground">{item.reason}</p></article>)}</div>}
    </section>
  </div>;
}

function AssessmentsPage() {
  const qc = useQueryClient();
  const results = useListAssessmentResults();
  const start = useStartAssessment();
  const submit = useSubmitAssessment();
  const [session, setSession] = useState<AssessmentSession | null>(null);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [error, setError] = useState('');
  const begin = (kind: 'interests' | 'personality') => { setError(''); start.mutate({ data: { kind } }, { onSuccess: value => { setSession(value); setAnswers({}); }, onError: e => setError(messageOf(e)) }); };
  const finish = () => { if (!session || Object.keys(answers).length < session.questions.length) return; submit.mutate({ id: session.id, data: { answers: session.questions.map(q => ({ questionId: q.id, score: answers[q.id] })) } }, { onSuccess: async () => { setSession(null); setAnswers({}); await qc.invalidateQueries({ queryKey: getListAssessmentResultsQueryKey() }); await qc.invalidateQueries({ queryKey: getGetDiscoveryDashboardQueryKey() }); }, onError: e => setError(messageOf(e)) }); };
  const kindLabel = (kind: string) => kind === 'personality' ? 'Work style & personality' : 'Career interests';
  return <div className="fade-up">
    <SectionHeading eyebrow="SMALL SIGNALS, NOT FINAL ANSWERS" title="A few good questions"><p className="max-w-sm text-xs leading-5 text-muted-foreground">Short, rotating check-ins to notice what draws you in. Exploratory instruments—not official O*NET or IPIP results.</p></SectionHeading>
    {error && <div role="alert" data-testid="status-assessment-error" className="mb-4 rounded-lg bg-destructive/5 p-3 text-xs text-destructive">{error}</div>}
    {session ? <section className="rounded-2xl border border-border bg-card p-5 md:p-8" data-testid="assessment-session"><div className="mb-6 flex items-center justify-between"><div><p className="mono-label text-[9px] text-primary">A QUICK CHECK-IN</p><h2 className="serif-display mt-2 text-3xl">{kindLabel(session.kind)}</h2></div><button onClick={() => setSession(null)} data-testid="button-exit-assessment" aria-label="Close check-in" className="grid size-9 place-items-center rounded-full text-muted-foreground hover:bg-secondary"><X size={17}/></button></div><p className="mb-6 text-xs text-muted-foreground">How much does each statement feel like you lately?</p><div className="space-y-4">{session.questions.map((q, index) => <div key={q.id} className="rounded-xl border border-border p-4" data-testid={`assessment-question-${q.id}`}><p className="mb-4 text-[13px] font-medium leading-5"><span className="mr-2 font-mono text-[10px] text-primary">0{index + 1}</span>{q.prompt}</p><div className="grid grid-cols-5 gap-2">{[1,2,3,4,5].map(score => <button key={score} onClick={() => setAnswers(prev => ({ ...prev, [q.id]: score }))} aria-pressed={answers[q.id] === score} data-testid={`answer-${q.id}-${score}`} className={`rounded-lg border py-2.5 text-xs transition-colors ${answers[q.id] === score ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background hover:border-primary/50'}`}><span className="block font-semibold">{score}</span><span className="hidden text-[8px] opacity-80 sm:block">{['Not at all','A little','Somewhat','Mostly','Very much'][score-1]}</span></button>)}</div></div>)}</div><div className="mt-6 flex items-center justify-between"><span className="text-[10px] text-muted-foreground">{Object.keys(answers).length} of {session.questions.length} answered</span><Button testId="button-submit-assessment" disabled={Object.keys(answers).length < session.questions.length || submit.isPending} onClick={finish}>{submit.isPending ? 'Saving…' : 'Save this check-in'}<ArrowRight size={14}/></Button></div></section> : <div className="grid gap-4 md:grid-cols-2">
      <button onClick={() => begin('interests')} disabled={start.isPending} data-testid="button-start-interests" className="group min-h-[190px] rounded-2xl border border-border bg-[hsl(36_40%_94%)] p-6 text-left transition-transform hover:-translate-y-0.5"><div className="flex items-center justify-between"><span className="grid size-10 place-items-center rounded-xl bg-card text-primary"><Compass size={20}/></span><ArrowRight size={17} className="text-muted-foreground transition-transform group-hover:translate-x-1"/></div><p className="serif-display mt-7 text-[28px]">Career interests</p><p className="mt-1 text-xs text-muted-foreground">What kinds of problems and possibilities pull you closer?</p></button>
      <button onClick={() => begin('personality')} disabled={start.isPending} data-testid="button-start-personality" className="group min-h-[190px] rounded-2xl border border-border bg-[hsl(152_24%_91%)] p-6 text-left transition-transform hover:-translate-y-0.5"><div className="flex items-center justify-between"><span className="grid size-10 place-items-center rounded-xl bg-card text-primary"><Waves size={20}/></span><ArrowRight size={17} className="text-muted-foreground transition-transform group-hover:translate-x-1"/></div><p className="serif-display mt-7 text-[28px]">Work style & personality</p><p className="mt-1 text-xs text-muted-foreground">Notice the conditions that help you do your best work.</p></button>
    </div>}
    <section className="mt-9">
      <div className="mb-4 flex items-end justify-between"><div><p className="mono-label text-[9px] text-muted-foreground">YOUR NOTES OVER TIME</p><h2 className="serif-display mt-1 text-[27px]">Past check-ins</h2></div><span className="text-[10px] text-muted-foreground">{results.data?.length ?? 0} saved</span></div>
      {results.isLoading ? <Skeleton rows={3}/> : results.isError ? <QueryError error={results.error} retry={() => void results.refetch()}/> : !results.data?.length ? <Empty icon={Activity} title="Nothing to compare yet" body="Your saved check-ins will gather here. Revisit them as your thinking changes."/> : (
        <div className="space-y-3">{results.data.map(result => (
          <div key={result.id} className="rounded-xl border border-border bg-card p-4 md:p-5" data-testid={`card-assessment-result-${result.id}`}>
            <div className="mb-4 flex items-center justify-between"><div><p className="text-[13px] font-semibold">{kindLabel(result.kind)}</p><p className="mt-1 text-[10px] text-muted-foreground">Completed {dateLabel(result.completedAt)} · exploratory</p></div><CheckCircle2 size={17} className="text-primary"/></div>
            <div className="grid gap-2 sm:grid-cols-2">{result.scores.map((score, i) => <div key={`${score.trait}-${i}`} className="flex items-center gap-3"><span className="w-28 truncate text-[10px] capitalize text-muted-foreground">{score.trait}</span><div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(0, Math.min(100, score.score))}%` }}/></div><span className="w-7 text-right font-mono text-[9px]">{score.score}</span></div>)}</div>
            <AssessmentDownloads result={result}/>
          </div>
        ))}</div>
      )}
    </section>
  </div>;
}

function ProfilePage() {
  const qc = useQueryClient();
  const profile = useGetCareerProfile();
  const conversations = useListCareerConversations();
  const assessments = useListAssessmentResults();
  const update = useUpdateCareerProfile();
  const [summary, setSummary] = useState('');
  const [strengths, setStrengths] = useState('');
  const [interests, setInterests] = useState('');
  const [preferences, setPreferences] = useState('');
  const [initialized, setInitialized] = useState(false);
  const [saved, setSaved] = useState(false);
  useEffect(() => { if (profile.data && !initialized) { setSummary(profile.data.summary ?? ''); setStrengths(profile.data.strengths?.join('\n') ?? ''); setInterests(profile.data.interests?.join('\n') ?? ''); setPreferences(profile.data.workPreferences?.join('\n') ?? ''); setInitialized(true); } }, [profile.data, initialized]);
  const save = (event: FormEvent) => { event.preventDefault(); setSaved(false); update.mutate({ data: { summary, strengths: strengths.split('\n').map(v => v.trim()).filter(Boolean), interests: interests.split('\n').map(v => v.trim()).filter(Boolean), workPreferences: preferences.split('\n').map(v => v.trim()).filter(Boolean) } }, { onSuccess: async () => { setSaved(true); await qc.invalidateQueries({ queryKey: getGetCareerProfileQueryKey() }); await qc.invalidateQueries({ queryKey: getGetDiscoveryDashboardQueryKey() }); }, onError: () => setSaved(false) }); };
  const fields = [{ label: 'Strengths', value: strengths, set: setStrengths, hint: 'One strength per line', test: 'strengths' }, { label: 'Interests', value: interests, set: setInterests, hint: 'Topics, problems, and possibilities that hold your attention', test: 'interests' }, { label: 'Work preferences', value: preferences, set: setPreferences, hint: 'The conditions that help you do good work', test: 'work-preferences' }];
  return <div className="fade-up">
    <SectionHeading eyebrow="A LIVING DOCUMENT" title="What you’re learning about you"><p className="max-w-xs text-xs leading-5 text-muted-foreground">Not a label. A working draft that shifts as you learn more.</p></SectionHeading>
    {profile.isLoading ? <Skeleton rows={5}/> : profile.isError ? <QueryError error={profile.error} retry={() => void profile.refetch()}/> : <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_330px]">
      <form onSubmit={save} className="space-y-4">
        <section className="rounded-2xl border border-border bg-card p-5 md:p-7"><label htmlFor="profile-summary" className="mono-label text-[9px] text-primary">THE THREAD SO FAR</label><textarea id="profile-summary" value={summary} onChange={e => setSummary(e.target.value)} rows={5} placeholder="What feels important about this moment in your career?" data-testid="input-profile-summary" className="mt-3 w-full resize-y rounded-lg border border-border bg-background p-3 text-[13px] leading-6 outline-none focus:border-primary"/><p className="mt-2 text-[10px] text-muted-foreground">Write in your own words. This space belongs to you.</p></section>
        {fields.map(field => <section key={field.test} className="rounded-2xl border border-border bg-card p-5 md:p-6"><label htmlFor={`profile-${field.test}`} className="flex items-center gap-2 text-[13px] font-semibold"><span className="size-1.5 rounded-full bg-primary"/>{field.label}</label><textarea id={`profile-${field.test}`} value={field.value} onChange={e => field.set(e.target.value)} rows={3} placeholder={field.hint} data-testid={`input-profile-${field.test}`} className="mt-3 w-full resize-y rounded-lg border border-border bg-background p-3 text-[12px] leading-6 outline-none focus:border-primary"/></section>)}
        <div className="flex items-center justify-between gap-3">{saved && <span className="flex items-center gap-1.5 text-[11px] text-primary" role="status" data-testid="status-profile-saved"><Check size={14}/>Changes saved</span>}<Button type="submit" testId="button-save-profile" disabled={update.isPending} >{update.isPending ? 'Saving…' : 'Save your profile'}<ArrowRight size={14}/></Button></div>
        {update.isError && <p role="alert" className="text-xs text-destructive">{messageOf(update.error)}</p>}
      </form>
      <aside className="space-y-4">
        <div className="rounded-2xl border border-border bg-[hsl(36_40%_94%)] p-5"><p className="mono-label text-[9px] text-primary">LAST UPDATED</p><p className="serif-display mt-2 text-2xl">{dateLabel(profile.data?.updatedAt)}</p><p className="mt-1 text-[10px] text-muted-foreground">Your understanding can change. That’s the point.</p></div>
        <div className="rounded-2xl border border-border bg-card p-5"><div className="mb-4 flex items-center justify-between"><div><p className="mono-label text-[9px] text-muted-foreground">SAVED CONVERSATIONS</p><h2 className="serif-display mt-1 text-[23px]">The useful bits</h2></div><MessageCircle size={17} className="text-primary"/></div>{conversations.isLoading ? <Skeleton rows={2}/> : conversations.isError ? <QueryError error={conversations.error} retry={() => void conversations.refetch()}/> : !conversations.data?.length ? <p className="text-xs leading-5 text-muted-foreground">When a conversation leaves you with something worth keeping, save its summary from the reflection space.</p> : <div className="space-y-3">{conversations.data.filter(c => c.summary && !c.archived).map(c => <div key={c.id} className="border-t border-border pt-3" data-testid={`summary-conversation-${c.id}`}><p className="text-[11px] font-semibold">{c.title}</p><p className="mt-1 text-[11px] leading-5 text-muted-foreground">{c.summary}</p></div>)}{conversations.data.every(c => !c.summary || c.archived) && <p className="text-xs text-muted-foreground">No summaries saved in this fresh workspace. Past chats remain in Conversation.</p>}</div>}</div>
        <div className="rounded-2xl border border-border bg-card p-5"><div className="mb-4 flex items-center justify-between"><div><p className="mono-label text-[9px] text-muted-foreground">TEST EVIDENCE</p><h2 className="serif-display mt-1 text-[23px]">Patterns over time</h2></div><CheckCircle2 size={17} className="text-primary"/></div>{assessments.isLoading ? <Skeleton rows={2}/> : assessments.isError ? <QueryError error={assessments.error} retry={() => void assessments.refetch()}/> : !assessments.data?.some(result => (result.kind === 'riasec' || result.kind === 'ipip') && !result.verificationRun) ? <p className="text-xs leading-5 text-muted-foreground">Complete either test to add its exploratory score pattern here.{assessments.data?.some(result => result.verificationRun) ? ' QA sample runs remain in test history, not your profile.' : ''}</p> : <div className="space-y-3">{assessments.data.filter(result => (result.kind === 'riasec' || result.kind === 'ipip') && !result.verificationRun).slice(0, 4).map(result => <div key={result.id} className="border-t border-border pt-3"><p className="text-[10px] font-semibold">{result.kind === 'riasec' ? 'RIASEC interest pattern' : 'Big Five work-style pattern'} · {dateLabel(result.completedAt)}</p><p className="mt-1 text-[10px] leading-5 text-muted-foreground">{result.scores.map(score => `${score.trait} ${score.score}/50`).join(' · ')}</p></div>)}</div>}<Link href="/tests" className="mt-4 inline-block text-[10px] font-semibold text-primary underline underline-offset-4">Open Tests</Link></div>
        <div className="rounded-xl bg-[hsl(152_24%_91%)] p-4"><p className="serif-display text-[20px]">No career is one neat sentence.</p><p className="mt-1 text-[11px] leading-5 text-muted-foreground">Keep the contradictions. They’re often where the interesting options live.</p></div>
      </aside>
    </div>}
  </div>;
}

function RecommendationsPage() {
  const qc = useQueryClient();
  const query = useListCareerRecommendations();
  const generate = useGenerateCareerRecommendations();
  const update = useUpdateCareerRecommendation();
  const [filter, setFilter] = useState<'all' | 'book' | 'activity'>('all');
  const [notice, setNotice] = useState('');
  const all = query.data ?? [];
  const list = all.filter(r => r.status !== 'dismissed' && (filter === 'all' || r.kind === filter));
  const refresh = async () => { await qc.invalidateQueries({ queryKey: getListCareerRecommendationsQueryKey() }); await qc.invalidateQueries({ queryKey: getGetDiscoveryDashboardQueryKey() }); };
  const changeStatus = (item: CareerRecommendation, status: 'saved' | 'tried' | 'dismissed' | 'new') => update.mutate({ id: item.id, data: { status } }, { onSuccess: () => { setNotice('Updated your list.'); void refresh(); }, onError: e => setNotice(messageOf(e)) });
  const byKind = (kind: string) => all.filter(item => item.kind === kind && item.status === 'saved').length;
  return <div className="fade-up">
    <SectionHeading eyebrow="SMALL EXPERIMENTS OUT IN THE WORLD" title="Things to explore"><div className="flex flex-col items-start gap-2 sm:items-end"><p className="max-w-xs text-xs leading-5 text-muted-foreground">Books to sit with. Activities to try. Keep what sparks something.</p><Button testId="button-generate-recommendations" onClick={() => { setNotice(''); generate.mutate(undefined, { onSuccess: async () => { await refresh(); }, onError: e => setNotice(messageOf(e)) }); }} disabled={generate.isPending}>{generate.isPending ? <LoaderCircle className="animate-spin" size={14}/> : <Sparkles size={14}/>}Find fresh ideas</Button></div></SectionHeading>
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div className="inline-flex rounded-lg border border-border bg-card p-1">{(['all','book','activity'] as const).map(value => <button key={value} onClick={() => setFilter(value)} aria-pressed={filter === value} data-testid={`button-filter-${value}`} className={`rounded-md px-3 py-1.5 text-[11px] capitalize ${filter === value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>{value === 'all' ? 'Everything' : value === 'book' ? 'Books' : 'Activities'}</button>)}</div><div className="flex gap-3 text-[10px] text-muted-foreground"><span><b className="text-foreground">{byKind('book')}</b> books saved</span><span><b className="text-foreground">{byKind('activity')}</b> activities saved</span></div></div>
    {notice && <div role="status" data-testid="status-recommendations" className="mb-4 flex items-center justify-between rounded-lg bg-secondary px-3 py-2 text-xs">{notice}<button onClick={() => setNotice('')} data-testid="button-dismiss-recommendation-notice"><X size={13}/></button></div>}
    {query.isLoading ? <Skeleton rows={4}/> : query.isError ? <QueryError error={query.error} retry={() => void query.refetch()}/> : list.length === 0 ? <Empty icon={BookOpen} title={all.length ? 'A clear page, for now' : 'Start with a small experiment'} body={all.length ? 'Nothing in this category is waiting to be explored. Try another filter or find fresh ideas.' : 'Generate a few thoughtful suggestions based on what you’ve shared. Save only what feels like you.'}/> : <div className="grid gap-3 md:grid-cols-2">{list.map(item => <article key={item.id} className={`relative overflow-hidden rounded-2xl border border-border p-5 ${item.kind === 'book' ? 'bg-[hsl(36_40%_94%)]' : 'bg-[hsl(152_24%_91%)]'}`} data-testid={`card-recommendation-${item.id}`}><div className="flex items-center justify-between"><span className="mono-label inline-flex items-center gap-1.5 text-[9px] text-primary">{item.kind === 'book' ? <BookOpen size={13}/> : <Activity size={13}/>} {item.kind === 'book' ? 'A BOOK TO CONSIDER' : 'AN EXPERIMENT'}</span><span className={`rounded-full px-2 py-1 text-[9px] capitalize ${item.status === 'tried' ? 'bg-primary/10 text-primary' : item.status === 'saved' ? 'bg-card text-foreground' : 'bg-card/70 text-muted-foreground'}`}>{item.status}</span></div><h2 className="serif-display mt-4 text-[27px] leading-tight">{item.title}</h2><p className="mt-2 text-[12px] leading-5 text-muted-foreground">{item.reason}</p><div className="mt-5 flex flex-wrap gap-2 border-t border-border/70 pt-4">{item.status !== 'saved' && item.status !== 'tried' && <button onClick={() => changeStatus(item, 'saved')} data-testid={`button-save-recommendation-${item.id}`} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-[10px] font-semibold text-primary-foreground"><Heart size={13}/>Save this</button>}{item.status === 'saved' && <button onClick={() => changeStatus(item, 'tried')} data-testid={`button-tried-recommendation-${item.id}`} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-[10px] font-semibold text-primary-foreground"><Check size={13}/>I tried this</button>}{item.status === 'tried' && <button onClick={() => changeStatus(item, 'saved')} data-testid={`button-unsave-recommendation-${item.id}`} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-[10px]"><Heart size={13}/>Keep saved</button>}<button onClick={() => changeStatus(item, 'dismissed')} data-testid={`button-dismiss-recommendation-${item.id}`} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[10px] text-muted-foreground hover:bg-card/70"><X size={13}/>Not for me</button></div><p className="absolute bottom-6 right-5 text-[9px] text-muted-foreground">{dateLabel(item.createdAt)}</p></article>)}</div>}
    <div className="mt-6 flex items-center gap-2 rounded-xl border border-border bg-card/60 px-4 py-3 text-[10px] leading-5 text-muted-foreground"><Lightbulb size={14} className="shrink-0 text-[#c58b43]"/>These are invitations, not assignments. Dismiss anything that doesn’t fit.</div>
  </div>;
}

function Router() {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}><Shell><Switch>
    <Route path="/" component={HomePage}/>
    <Route path="/assessments" component={TestsPage}/>
    <Route path="/check-ins" component={AssessmentsPage}/>
    <Route path="/tests" component={TestsPage}/>
    <Route path="/profile" component={ProfilePage}/>
    <Route path="/recommendations" component={RecommendationsPage}/>
    <Route component={NotFound}/>
  </Switch></Shell></ErrorBoundary>;
}

function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><AuthGate><Router/></AuthGate></WouterRouter><Toaster/></TooltipProvider></QueryClientProvider>;
}

export default App;
