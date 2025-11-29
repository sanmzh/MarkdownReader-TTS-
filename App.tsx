import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Pause, Square, Image as ImageIcon, FileText, Wifi, WifiOff, Globe, Monitor, Settings2, Gauge, MousePointerClick, FolderOpen, Sidebar as SidebarIcon, File, ChevronRight, ChevronDown, Hash, Link as LinkIcon, PenLine, BookOpen, PanelLeftClose, PanelLeftOpen, Quote, List as ListIcon, Table as TableIcon, Bot, X } from 'lucide-react';
import { VoiceName, Segment, TTSProvider, VoiceOption, SegmentType, OPENAI_VOICES } from './types';
import { generateSpeech, playAudioBuffer, playNativeText, getBrowserVoices, AudioController, generateOpenAISpeech } from './services/gemini';

// --- Constants ---
const DEFAULT_MARKDOWN = `# 欢迎使用 Markdown 朗读器

## 功能演示

这是一个 Windows 风格的本地应用演示。

### 核心特性

1. **自然朗读**：利用 AI 将文本转换为语音。
2. **智能高亮**：朗读时自动高亮当前段落。
3. **多引擎支持**：Gemini, OpenAI, 和本地浏览器。

---

### 新增排版支持

> 这是一个引用块示例。Markdown 朗读器可以识别它，并以不同的样式显示。

#### 列表展示

- 支持无序列表
- 自动识别列表项
- 紧凑的排版

#### 表格展示

| 功能 | 状态 | 说明 |
| :--- | :--- | :--- |
| 标题识别 | ✅ 支持 | H1-H6 |
| 表格渲染 | ✅ 支持 | 自动条纹样式 |
| 图片展示 | ✅ 支持 | 暂停1秒预览 |

![示例图片](https://images.unsplash.com/photo-1472214103451-9374bd1c798e?ixlib=rb-4.0.3&auto=format&fit=crop&w=1000&q=80)

## 关于引擎

现在您可以选择 **Gemini**, **OpenAI**, 或 **浏览器本地语音**。
`;

const GEMINI_VOICES: VoiceOption[] = [
  { id: VoiceName.Kore, name: 'Gemini - Kore (女声)', provider: 'gemini', gender: 'Female' },
  { id: VoiceName.Puck, name: 'Gemini - Puck (男声)', provider: 'gemini', gender: 'Male' },
  { id: VoiceName.Charon, name: 'Gemini - Charon (深沉)', provider: 'gemini', gender: 'Male' },
  { id: VoiceName.Fenrir, name: 'Gemini - Fenrir (激昂)', provider: 'gemini', gender: 'Male' },
  { id: VoiceName.Zephyr, name: 'Gemini - Zephyr (温柔)', provider: 'gemini', gender: 'Female' },
];

const DEFAULT_HIGHLIGHT_COLOR = '#fef08a'; // Yellow-200
const PREFETCH_WINDOW = 3; 

// --- Helper: Text Cleaning for TTS ---
function getSpeakableText(text: string, type: SegmentType = 'text'): string {
  if (!text) return "";
  
  let clean = text;

  // Type specific cleaning
  if (type === 'table') {
     // Replace pipes with commas for natural reading pauses
     clean = clean.replace(/\|/g, ',');
     clean = clean.replace(/-{3,}/g, ''); // Remove divider lines
  } else if (type === 'blockquote') {
     clean = clean.replace(/^>\s*/gm, '');
  } else if (type === 'list') {
     clean = clean.replace(/^(\d+\.|-|\*)\s+/gm, '');
  }

  // General Markdown cleaning
  // 1. Replace links [text](url) with just text
  clean = clean.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  // 2. Remove formatting like **bold**, *italic*, `code`
  clean = clean.replace(/(\*\*|__)(.*?)\1/g, '$2'); // Bold
  clean = clean.replace(/(\*|_)(.*?)\1/g, '$2');    // Italic
  clean = clean.replace(/`([^`]+)`/g, '$1');        // Code
  // 3. Remove images if inline
  clean = clean.replace(/!\[.*?\]\(.*?\)/g, '');
  
  return clean.trim();
}

// --- Helper: Inline Markdown Renderer ---
const InlineMarkdown = ({ text }: { text: string }) => {
  if (!text) return null;

  const codeSplit = text.split(/(`[^`]+`)/g);

  return (
    <>
      {codeSplit.map((part, i) => {
        if (part.startsWith('`') && part.endsWith('`')) {
          return (
            <code key={i} className="mx-1 px-1.5 py-0.5 rounded bg-gray-100 text-pink-600 font-mono text-[0.85em] border border-gray-200">
              {part.slice(1, -1)}
            </code>
          );
        }

        const linkSplit = part.split(/(\[[^\]]+\]\([^)]+\))/g);

        return (
          <React.Fragment key={i}>
            {linkSplit.map((linkPart, j) => {
              const linkMatch = linkPart.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
              if (linkMatch) {
                return (
                  <a 
                    key={`${i}-${j}`} 
                    href={linkMatch[2]} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-800 hover:underline inline-flex items-center gap-0.5 font-medium transition-colors"
                    onClick={(e) => e.stopPropagation()} 
                  >
                    {linkMatch[1]}
                    <LinkIcon size={10} className="opacity-50" />
                  </a>
                );
              }

              const boldSplit = linkPart.split(/(\*\*[^*]+\*\*)/g);
              
              return (
                <React.Fragment key={`${i}-${j}`}>
                  {boldSplit.map((boldPart, k) => {
                    if (boldPart.startsWith('**') && boldPart.endsWith('**')) {
                      return (
                        <strong key={`${i}-${j}-${k}`} className="font-bold text-gray-900">
                          {boldPart.slice(2, -2)}
                        </strong>
                      );
                    }

                    const italicSplit = boldPart.split(/(\*[^*]+\*)/g);
                    return (
                      <React.Fragment key={`${i}-${j}-${k}`}>
                        {italicSplit.map((italicPart, l) => {
                          if (italicPart.startsWith('*') && italicPart.endsWith('*')) {
                            return (
                              <em key={`${i}-${j}-${k}-${l}`} className="italic text-gray-800">
                                {italicPart.slice(1, -1)}
                              </em>
                            );
                          }
                          return <span key={`${i}-${j}-${k}-${l}`}>{italicPart}</span>;
                        })}
                      </React.Fragment>
                    );
                  })}
                </React.Fragment>
              );
            })}
          </React.Fragment>
        );
      })}
    </>
  );
};

// --- Helper: Markdown Parsing ---
function parseMarkdown(text: string): Segment[] {
  const segments: Segment[] = [];
  const blocks = text.split(/\n\n+/);
  
  let idCounter = 0;

  blocks.forEach(block => {
    const trimmedBlock = block.trim();
    if (!trimmedBlock) return;

    // 1. Horizontal Rule (---, ***)
    if (/^(\*{3,}|-{3,})$/.test(trimmedBlock)) {
       segments.push({
        id: `seg-${idCounter++}`,
        type: 'hr',
        content: '',
        originalText: block
      });
      return;
    }

    // 2. Image Check
    const imageRegex = /!\[(.*?)\]\((.*?)\)/;
    const imgMatch = block.match(imageRegex);

    if (imgMatch && trimmedBlock.startsWith('![')) {
         segments.push({
          id: `seg-${idCounter++}`,
          type: 'image',
          content: imgMatch[2],
          alt: imgMatch[1],
          originalText: block
        });
        return;
    }

    // 3. Header Check (H1-H6)
    const headerRegex = /^(#{1,6})\s+(.*)/;
    const headerMatch = trimmedBlock.match(headerRegex);

    if (headerMatch) {
      const level = headerMatch[1].length;
      const content = headerMatch[2].trim();
      segments.push({
        id: `seg-${idCounter++}`,
        type: 'header',
        content: content,
        originalText: block,
        metadata: { level }
      });
      return;
    }

    // 4. Blockquote Check (> text)
    if (trimmedBlock.startsWith('>')) {
      const content = trimmedBlock.split('\n').map(l => l.replace(/^>\s?/, '')).join('\n');
      segments.push({
        id: `seg-${idCounter++}`,
        type: 'blockquote',
        content: content,
        originalText: block
      });
      return;
    }

    // 5. Table Check (Start with |)
    if (trimmedBlock.startsWith('|')) {
       segments.push({
        id: `seg-${idCounter++}`,
        type: 'table',
        content: trimmedBlock,
        originalText: block
      });
      return;
    }

    // 6. List Check (- item, 1. item)
    // Simple heuristic: if most lines start with - * or 1.
    const lines = trimmedBlock.split('\n');
    const isUnordered = lines.every(l => /^\s*[-*]\s/.test(l));
    const isOrdered = lines.every(l => /^\s*\d+\.\s/.test(l));

    if ((isUnordered || isOrdered) && lines.length > 0) {
      segments.push({
        id: `seg-${idCounter++}`,
        type: 'list',
        content: trimmedBlock,
        originalText: block,
        metadata: { listType: isOrdered ? 'ordered' : 'unordered' }
      });
      return;
    }

    // 7. Normal Text
    segments.push({
      id: `seg-${idCounter++}`,
      type: 'text',
      content: trimmedBlock,
      originalText: block
    });
  });

  return segments;
}

export default function App() {
  // --- State ---
  const [markdown, setMarkdown] = useState(DEFAULT_MARKDOWN);
  const [segments, setSegments] = useState<Segment[]>([]);
  
  // Settings
  const [provider, setProvider] = useState<TTSProvider>('gemini');
  const [voiceId, setVoiceId] = useState<string>(VoiceName.Kore);
  const [highlightColor, setHighlightColor] = useState(DEFAULT_HIGHLIGHT_COLOR);
  const [speed, setSpeed] = useState(1.0);
  const [openaiKey, setOpenaiKey] = useState("");
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  
  // Native Voices
  const [browserVoices, setBrowserVoices] = useState<VoiceOption[]>([]);

  // Playback State
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentIndex, setCurrentIndex] = useState<number | null>(null);
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);

  // File Management State
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [folderFiles, setFolderFiles] = useState<File[]>([]);
  const [currentFileName, setCurrentFileName] = useState<string>('');
  
  // Editor State
  const [showEditor, setShowEditor] = useState(true);

  // Refs
  const activeAudioControllerRef = useRef<AudioController | null>(null);
  const segmentsRef = useRef<Segment[]>([]);
  const isPlayingRef = useRef(false);
  const speedRef = useRef(1.0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  
  // Cache for Gemini Audio Buffers
  const audioCache = useRef<Map<string, Promise<AudioBuffer>>>(new Map());

  // --- Initialization ---

  useEffect(() => {
    speedRef.current = speed;
    if (activeAudioControllerRef.current) {
      activeAudioControllerRef.current.setRate(speed);
    }
  }, [speed]);

  useEffect(() => {
    const parsed = parseMarkdown(markdown);
    setSegments(parsed);
    segmentsRef.current = parsed;
    if (isPlayingRef.current) handleStop();
  }, [markdown]);

  useEffect(() => {
    getBrowserVoices().then(voices => {
      const options: VoiceOption[] = voices.map(v => ({
        id: v.name,
        name: `${v.name} (${v.lang})`,
        provider: 'browser' as TTSProvider,
      })).filter(v => v.id);
      setBrowserVoices(options);
    });
  }, []);

  useEffect(() => {
    if (provider === 'gemini') {
      setVoiceId(VoiceName.Kore);
    } else if (provider === 'openai') {
      setVoiceId('alloy');
    } else {
      if (browserVoices.length > 0) {
        const zhVoice = browserVoices.find(v => v.name.includes('Chinese') || v.name.includes('CN') || v.name.includes('zh'));
        setVoiceId(zhVoice ? zhVoice.id : browserVoices[0].id);
      }
    }
  }, [provider, browserVoices]);

  useEffect(() => {
    if (currentIndex !== null) {
      const el = document.getElementById(`segment-${currentIndex}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [currentIndex]);

  // --- Audio Logic ---

  const getCacheKey = (content: string, v: string) => `${v}-${content}`;

  const loadSegmentAudio = useCallback((segment: Segment, v: string): Promise<AudioBuffer> | null => {
    if (segment.type === 'image' || segment.type === 'hr') return null;
    if (provider === 'browser') return null;

    const speakableText = getSpeakableText(segment.content, segment.type);
    if (!speakableText.trim()) return null;

    const key = getCacheKey(speakableText, v);
    
    if (audioCache.current.has(key)) {
      return audioCache.current.get(key)!;
    }

    let promise: Promise<AudioBuffer>;
    if (provider === 'gemini') {
      promise = generateSpeech(speakableText, v);
    } else if (provider === 'openai') {
      if (!openaiKey) return null;
      promise = generateOpenAISpeech(speakableText, v, openaiKey);
    } else {
      return null;
    }

    const caughtPromise = promise.catch(err => {
      audioCache.current.delete(key);
      throw err;
    });

    audioCache.current.set(key, caughtPromise);
    return caughtPromise;
  }, [provider, openaiKey]);

  const pausePlayback = useCallback(() => {
    if (activeAudioControllerRef.current) {
      activeAudioControllerRef.current.stop();
      activeAudioControllerRef.current = null;
    }
    setIsPlaying(false);
    isPlayingRef.current = false;
    setIsLoadingAudio(false);
    window.speechSynthesis.cancel();
  }, []);

  const handleStop = useCallback(() => {
    pausePlayback();
    setCurrentIndex(null);
  }, [pausePlayback]);

  const playSequence = async (startIndex: number) => {
    if (startIndex >= segmentsRef.current.length || !isPlayingRef.current) {
      if (startIndex >= segmentsRef.current.length) {
        handleStop();
      }
      return;
    }

    setCurrentIndex(startIndex);
    const segment = segmentsRef.current[startIndex];
    const currentSpeed = speedRef.current; 

    // Prefetch next 
    if (provider !== 'browser') {
      for (let i = 1; i <= PREFETCH_WINDOW; i++) {
        const nextIdx = startIndex + i;
        if (nextIdx < segmentsRef.current.length) {
          loadSegmentAudio(segmentsRef.current[nextIdx], voiceId);
        }
      }
    }

    try {
      if (segment.type === 'hr') {
        // Skip HR
         if (isPlayingRef.current) playSequence(startIndex + 1);
         return;
      }

      if (segment.type === 'image') {
        await new Promise<void>(resolve => {
          const timeout = setTimeout(resolve, 1000);
          activeAudioControllerRef.current = { 
             promise: Promise.resolve(), 
             stop: () => clearTimeout(timeout), 
             setRate: () => {}
          };
        });
      } else {
        const textToSpeak = getSpeakableText(segment.content, segment.type);
        
        if (!textToSpeak.trim()) {
           if (isPlayingRef.current) playSequence(startIndex + 1);
           return;
        }

        if (provider === 'gemini' || provider === 'openai') {
          if (provider === 'openai' && !openaiKey) {
             alert("请先在设置中配置 OpenAI API Key");
             handleStop();
             return;
          }

          setIsLoadingAudio(true);
          const key = getCacheKey(textToSpeak, voiceId);
          let audioPromise = audioCache.current.get(key);
          
          if (!audioPromise) {
             if (provider === 'gemini') {
                audioPromise = generateSpeech(textToSpeak, voiceId);
             } else {
                audioPromise = generateOpenAISpeech(textToSpeak, voiceId, openaiKey);
             }
             audioCache.current.set(key, audioPromise);
          }

          const buffer = await audioPromise;
          setIsLoadingAudio(false);

          if (!isPlayingRef.current) return;

          const controller = playAudioBuffer(buffer, currentSpeed);
          activeAudioControllerRef.current = controller;
          await controller.promise;

        } else {
          if (!isPlayingRef.current) return;
          const controller = playNativeText(textToSpeak, voiceId, currentSpeed);
          activeAudioControllerRef.current = controller;
          await controller.promise;
        }
      }

      if (isPlayingRef.current) {
        playSequence(startIndex + 1);
      }

    } catch (err) {
      console.error("Playback error:", err);
      if ((provider === 'gemini' || provider === 'openai') && isPlayingRef.current) {
         // Optionally retry or just stop
         handleStop();
      }
    }
  };

  const handleTogglePlay = () => {
    if (isPlaying) {
      pausePlayback();
    } else {
      if (provider === 'openai' && !openaiKey) {
        setIsSettingsOpen(true);
        return;
      }
      setIsPlaying(true);
      isPlayingRef.current = true;
      const startFrom = currentIndex !== null ? currentIndex : 0;
      playSequence(startFrom);
    }
  };

  const handleSegmentClick = (index: number) => {
    setCurrentIndex(index);
    pausePlayback();
    setTimeout(() => {
      setIsPlaying(true);
      isPlayingRef.current = true;
      playSequence(index);
    }, 10);
  };

  const handleFileImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    loadFileContent(file);
    e.target.value = '';
  };

  const handleFolderImportClick = () => {
    folderInputRef.current?.click();
  };

  const handleFolderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const validFiles = files
      .filter(f => f.name.endsWith('.md') || f.name.endsWith('.txt') || f.name.endsWith('.markdown'))
      .sort((a, b) => a.name.localeCompare(b.name));
    
    if (validFiles.length > 0) {
      setFolderFiles(validFiles);
      if (!isSidebarOpen) setIsSidebarOpen(true);
    } else {
      alert("文件夹中没有找到 Markdown (.md) 或文本文件。");
    }
    e.target.value = '';
  };

  const loadFileContent = (file: File) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result;
      if (typeof content === 'string') {
        setMarkdown(content);
        setCurrentFileName(file.name);
        handleStop(); 
      }
    };
    reader.readAsText(file);
  };

  const handleSelectFileFromList = (file: File) => {
    loadFileContent(file);
  };

  let activeVoiceList = browserVoices;
  if (provider === 'gemini') activeVoiceList = GEMINI_VOICES;
  if (provider === 'openai') activeVoiceList = OPENAI_VOICES;

  return (
    <div className="flex h-screen w-full flex-col bg-[#f3f4f6] text-slate-800 font-sans overflow-hidden">
      
      {/* --- Settings Modal --- */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm">
          <div className="bg-white rounded-lg shadow-xl w-96 p-6 border border-gray-200">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wider flex items-center gap-2">
                <Settings2 size={16} /> 设置
              </h2>
              <button onClick={() => setIsSettingsOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">OpenAI API Key</label>
                <input 
                  type="password" 
                  value={openaiKey}
                  onChange={(e) => setOpenaiKey(e.target.value)}
                  placeholder="sk-..."
                  className="w-full text-xs p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 outline-none"
                />
                <p className="text-[10px] text-gray-400 mt-1">Key 仅保存在本地内存中，刷新后需重新输入。</p>
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <button 
                onClick={() => setIsSettingsOpen(false)}
                className="bg-gray-900 text-white text-xs font-medium px-4 py-2 rounded hover:bg-gray-800 transition-colors"
              >
                完成
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- Header --- */}
      <header className="flex items-center justify-between px-4 py-3 bg-white border-b border-gray-200 select-none shadow-sm z-20 gap-4 shrink-0">
        <div className="flex items-center gap-3 min-w-fit">
          <button 
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="p-1.5 text-gray-500 hover:bg-gray-100 rounded-md transition-colors"
            title={isSidebarOpen ? "收起文件栏" : "展开文件栏"}
          >
            {isSidebarOpen ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
          </button>
          <div className={`p-1.5 rounded-md text-white shadow-sm transition-colors ${
            provider === 'gemini' ? 'bg-blue-600' : (provider === 'openai' ? 'bg-purple-600' : 'bg-emerald-600')
          }`}>
            <FileText size={18} />
          </div>
          <h1 className="font-semibold text-sm text-gray-700 tracking-wide hidden sm:block">
            Markdown Reader <span className="opacity-50 font-normal">| {provider === 'gemini' ? 'Cloud' : (provider === 'openai' ? 'OpenAI' : 'Local')}</span>
          </h1>
        </div>
        
        <div className="flex items-center gap-4 flex-1 justify-end">
          <button 
            onClick={handleTogglePlay}
            className={`flex items-center gap-2 px-6 py-1.5 rounded-md text-sm font-medium transition-all shadow-sm whitespace-nowrap min-w-[100px] justify-center ${
              isPlaying 
                ? 'bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100' 
                : (currentIndex !== null ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-gray-900 text-white hover:bg-gray-800')
            }`}
          >
            {isPlaying ? <><Pause size={14} fill="currentColor" /> 暂停</> : <><Play size={14} fill="currentColor" /> {currentIndex !== null ? '继续' : '朗读'}</>}
          </button>

          <button 
            onClick={handleStop}
            disabled={currentIndex === null}
            title="停止并重置"
            className={`p-2 rounded-md transition-all ${
              currentIndex !== null
                ? 'text-gray-600 hover:bg-red-50 hover:text-red-600' 
                : 'text-gray-300 cursor-not-allowed'
            }`}
          >
            <Square size={16} fill="currentColor" />
          </button>

          <div className="h-6 w-px bg-gray-200 mx-1"></div>

          <div className="flex items-center gap-4 overflow-x-auto pb-1 -mb-1 scrollbar-hide">
             <div className="flex flex-col gap-1">
              <label className="text-[9px] font-bold text-gray-400 uppercase tracking-widest flex items-center gap-1">视图</label>
              <div className="flex bg-gray-100 p-0.5 rounded-lg border border-gray-200">
                <button 
                  onClick={() => setShowEditor(true)}
                  className={`flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium transition-all whitespace-nowrap ${
                    showEditor ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <PenLine size={11} /> 编辑
                </button>
                <button 
                  onClick={() => setShowEditor(false)}
                  className={`flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium transition-all whitespace-nowrap ${
                    !showEditor ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <BookOpen size={11} /> 阅读
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[9px] font-bold text-gray-400 uppercase tracking-widest flex items-center gap-1"><Settings2 size={9} /> 引擎</label>
              <div className="flex bg-gray-100 p-0.5 rounded-lg border border-gray-200">
                <button 
                  onClick={() => !isPlaying && setProvider('gemini')}
                  disabled={isPlaying}
                  className={`flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium transition-all whitespace-nowrap ${
                    provider === 'gemini' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <Globe size={11} /> Cloud
                </button>
                 <button 
                  onClick={() => !isPlaying && setProvider('openai')}
                  disabled={isPlaying}
                  className={`flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium transition-all whitespace-nowrap ${
                    provider === 'openai' ? 'bg-white text-purple-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <Bot size={11} /> GPT
                </button>
                <button 
                  onClick={() => !isPlaying && setProvider('browser')}
                  disabled={isPlaying}
                  className={`flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium transition-all whitespace-nowrap ${
                    provider === 'browser' ? 'bg-white text-emerald-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <Monitor size={11} /> Local
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">声音</label>
              <select 
                value={voiceId}
                onChange={(e) => setVoiceId(e.target.value)}
                className="text-xs border border-gray-300 rounded-md px-2 py-1 bg-white focus:ring-2 focus:ring-blue-500 outline-none w-32"
                disabled={isPlaying}
              >
                {activeVoiceList.map(v => (
                  <option key={v.id} value={v.id} title={v.name}>{v.name.substring(0, 20)}{v.name.length > 20 ? '...' : ''}</option>
                ))}
                {activeVoiceList.length === 0 && <option disabled>无可用语音</option>}
              </select>
            </div>

            <div className="flex flex-col gap-1 min-w-[80px]">
               <label className="text-[9px] font-bold text-gray-400 uppercase tracking-widest flex items-center justify-between">
                <span className="flex items-center gap-1"><Gauge size={9} /> 语速</span>
                <span className="text-gray-500">{speed.toFixed(1)}x</span>
              </label>
              <input 
                type="range" 
                min="0.5" 
                max="5.0" 
                step="0.1" 
                value={speed}
                onChange={(e) => setSpeed(parseFloat(e.target.value))}
                className="h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-gray-600"
              />
            </div>

             <div className="flex flex-col gap-1">
               <label className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">其他</label>
               <div className="flex gap-2">
                 <input 
                  type="color" 
                  value={highlightColor}
                  onChange={(e) => setHighlightColor(e.target.value)}
                  className="w-8 h-5 rounded cursor-pointer border border-gray-200 p-0 overflow-hidden"
                  title="高亮颜色"
                />
                 <button 
                  onClick={() => setIsSettingsOpen(true)}
                  className="w-8 h-5 flex items-center justify-center bg-gray-100 hover:bg-gray-200 rounded border border-gray-200 text-gray-600"
                  title="设置"
                >
                  <Settings2 size={12} />
                </button>
               </div>
            </div>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        
        {/* --- Sidebar --- */}
        {isSidebarOpen && (
          <div className="w-64 flex flex-col bg-gray-50 border-r border-gray-200 transition-all duration-300 shrink-0">
            <div className="p-3 border-b border-gray-200 flex justify-between items-center bg-gray-100">
              <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Explorer</span>
              <div className="flex gap-1">
                <button 
                  onClick={handleFileImportClick}
                  className="p-1 hover:bg-white rounded text-gray-600 transition-colors"
                  title="打开单个文件"
                >
                   <File size={14} />
                </button>
                <button 
                  onClick={handleFolderImportClick}
                  className="p-1 hover:bg-white rounded text-gray-600 transition-colors"
                  title="打开文件夹"
                >
                   <FolderOpen size={14} />
                </button>
              </div>
              <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".md,.txt,.markdown" className="hidden" />
              <input type="file" ref={folderInputRef} onChange={handleFolderChange} 
                // @ts-ignore
                webkitdirectory="" directory="" className="hidden" 
              />
            </div>
            
            <div className="flex-1 overflow-y-auto py-2">
              {folderFiles.length === 0 ? (
                <div className="px-4 py-8 text-center text-gray-400 text-xs">
                  <p className="mb-2">未打开文件夹</p>
                  <button onClick={handleFolderImportClick} className="text-blue-500 hover:underline">点击选择文件夹</button>
                </div>
              ) : (
                <div className="flex flex-col">
                  {folderFiles.map((file, idx) => (
                    <button
                      key={`${file.name}-${idx}`}
                      onClick={() => handleSelectFileFromList(file)}
                      className={`flex items-center gap-2 px-3 py-1.5 text-xs text-left truncate transition-colors ${
                        currentFileName === file.name ? 'bg-blue-100 text-blue-700 font-medium' : 'text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      <File size={12} className={currentFileName === file.name ? 'text-blue-500' : 'text-gray-400'} />
                      <span className="truncate">{file.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="p-2 border-t border-gray-200 text-[10px] text-gray-400 flex justify-between">
              <span>{folderFiles.length} 个文件</span>
            </div>
          </div>
        )}

        {/* --- Main Content --- */}
        <div className="flex-1 flex overflow-hidden bg-gray-50/50">
          
          {/* Editor */}
          {showEditor && (
            <div className="w-1/2 flex flex-col border-r border-gray-200 bg-white min-w-[300px]">
              <div className="bg-white px-5 py-2 text-[10px] font-bold text-gray-400 border-b border-gray-100 uppercase tracking-widest flex justify-between items-center h-[37px] shrink-0">
                <div className="flex items-center gap-2">
                  {currentFileName ? <><File size={10} /><span className="text-gray-700">{currentFileName}</span></> : <span>编辑器</span>}
                </div>
                <span className={`flex items-center gap-1.5 ${provider === 'gemini' ? 'text-blue-500' : (provider === 'openai' ? 'text-purple-500' : 'text-emerald-500')}`}>
                  {provider === 'gemini' ? <Wifi size={12} /> : (provider === 'openai' ? <Bot size={12} /> : <WifiOff size={12} />)}
                  {provider === 'gemini' ? '在线' : (provider === 'openai' ? 'OpenAI' : '离线')}
                </span>
              </div>
              <textarea
                className="flex-1 w-full p-8 resize-none outline-none font-mono text-sm leading-relaxed text-gray-700 selection:bg-blue-100 focus:bg-gray-50/30 transition-colors"
                value={markdown}
                onChange={(e) => setMarkdown(e.target.value)}
                placeholder="在此输入 Markdown 内容..."
                spellCheck={false}
              />
            </div>
          )}

          {/* Reader */}
          <div className={`${showEditor ? 'w-1/2' : 'w-full'} flex flex-col relative transition-all duration-300`}>
            <div className={`
              ${showEditor ? 'px-5 bg-white/80 border-b' : 'max-w-4xl mx-auto w-full px-8 bg-white border-b border-x shadow-sm'} 
              py-2 text-[10px] font-bold text-gray-400 border-gray-200 uppercase tracking-widest flex justify-between items-center sticky top-0 z-10 h-[37px] backdrop-blur-sm transition-all
            `}>
              <span>实时预览</span>
              {isLoadingAudio && provider !== 'browser' && (
                <span className="flex items-center gap-2 text-blue-600 animate-pulse transition-opacity">
                  <span className="w-1.5 h-1.5 bg-blue-600 rounded-full"></span>
                  <span className="text-xs font-medium">下载中...</span>
                </span>
              )}
            </div>
            
            <div className={`flex-1 overflow-y-auto scroll-smooth ${showEditor ? 'p-8 space-y-1' : 'px-0 py-8'}`}>
              <div className={`${showEditor ? '' : 'max-w-4xl mx-auto bg-white min-h-full px-12 py-10 shadow-sm border-x border-gray-200 space-y-1'}`}>
                {segments.map((segment, index) => {
                  const isActive = currentIndex === index;
                  
                  const activeStyle = isActive ? {
                    backgroundColor: highlightColor,
                    boxShadow: '0 2px 10px rgba(0,0,0,0.05)',
                    transform: 'scale(1.005)',
                    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                    borderLeft: `4px solid ${provider === 'gemini' ? '#2563eb' : (provider === 'openai' ? '#9333ea' : '#059669')}` 
                  } : {
                    transition: 'all 0.2s ease',
                    borderLeft: '4px solid transparent'
                  };

                  const commonClasses = `rounded-lg cursor-pointer group relative ${!isActive ? 'hover:bg-gray-50/50' : ''}`;

                  // --- HR ---
                  if (segment.type === 'hr') {
                    return (
                       <div key={segment.id} className="py-2 cursor-default">
                         <hr className="border-t border-gray-200" />
                       </div>
                    );
                  }

                  // --- IMAGE ---
                  if (segment.type === 'image') {
                    return (
                      <div 
                        key={segment.id}
                        id={`segment-${index}`}
                        style={activeStyle}
                        onClick={() => handleSegmentClick(index)}
                        className={`rounded-lg overflow-hidden bg-white shadow-sm cursor-pointer relative mt-2 mb-2 ${isActive ? 'ring-2 ring-blue-500/20' : ''}`}
                      >
                        <img src={segment.content} alt={segment.alt} className="w-full h-auto object-cover max-h-[400px]" />
                      </div>
                    );
                  }

                  // --- HEADER ---
                  if (segment.type === 'header') {
                    const level = segment.metadata?.level || 1;
                    const HeaderTag = `h${Math.min(level, 6)}` as React.ElementType;
                    const sizeClasses = {
                      1: 'text-2xl font-bold pb-1 mb-1 border-b border-gray-200 mt-4',
                      2: 'text-xl font-bold pb-1 mb-1 border-b border-gray-200 mt-3',
                      3: 'text-lg font-bold mt-2',
                      4: 'text-base font-bold mt-2',
                      5: 'text-sm font-bold mt-1',
                      6: 'text-xs font-bold uppercase tracking-wide mt-1'
                    };

                    return (
                      <div 
                        key={segment.id}
                        id={`segment-${index}`}
                        style={activeStyle}
                        onClick={() => handleSegmentClick(index)}
                        className={`px-4 py-1.5 ${commonClasses}`}
                      >
                         {!isActive && (
                          <div className="absolute -left-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <div className="bg-gray-800 text-white p-1 rounded-full shadow-md"><Hash size={10} /></div>
                          </div>
                        )}
                        {/* @ts-ignore */}
                        <HeaderTag className={`text-gray-900 ${sizeClasses[level as keyof typeof sizeClasses]}`}>
                          <InlineMarkdown text={segment.content} />
                        </HeaderTag>
                      </div>
                    )
                  }

                  // --- BLOCKQUOTE ---
                  if (segment.type === 'blockquote') {
                    return (
                      <div 
                        key={segment.id}
                        id={`segment-${index}`}
                        style={activeStyle}
                        onClick={() => handleSegmentClick(index)}
                        className={`px-4 py-1.5 ${commonClasses}`}
                      >
                        {!isActive && (
                          <div className="absolute -left-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <div className="bg-gray-800 text-white p-1 rounded-full shadow-md"><Quote size={10} /></div>
                          </div>
                        )}
                        <blockquote className="border-l-2 border-gray-300 pl-3 py-0.5 italic text-gray-600 bg-gray-50/50 rounded-r">
                           <InlineMarkdown text={segment.content} />
                        </blockquote>
                      </div>
                    );
                  }

                  // --- LIST ---
                  if (segment.type === 'list') {
                    const isOrdered = segment.metadata?.listType === 'ordered';
                    const lines = segment.content.split('\n');
                    
                    return (
                      <div 
                        key={segment.id}
                        id={`segment-${index}`}
                        style={activeStyle}
                        onClick={() => handleSegmentClick(index)}
                        className={`px-4 py-1.5 ${commonClasses}`}
                      >
                        {!isActive && (
                          <div className="absolute -left-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <div className="bg-gray-800 text-white p-1 rounded-full shadow-md"><ListIcon size={10} /></div>
                          </div>
                        )}
                        {isOrdered ? (
                           <ol className="list-decimal list-inside space-y-0.5 text-gray-700 leading-relaxed text-sm">
                             {lines.map((line, i) => <li key={i} className="pl-1"><InlineMarkdown text={line.replace(/^\d+\.\s+/, '')} /></li>)}
                           </ol>
                        ) : (
                           <ul className="list-disc list-inside space-y-0.5 text-gray-700 leading-relaxed text-sm">
                             {lines.map((line, i) => <li key={i} className="pl-1"><InlineMarkdown text={line.replace(/^[-*]\s+/, '')} /></li>)}
                           </ul>
                        )}
                      </div>
                    );
                  }

                  // --- TABLE ---
                  if (segment.type === 'table') {
                    const rows = segment.content.trim().split('\n');
                    const headers = rows[0].split('|').filter((_, i, arr) => i !== 0 && i !== arr.length -1).map(c => c.trim());
                    const bodyRows = rows.slice(2).map(r => r.split('|').filter((_, i, arr) => i !== 0 && i !== arr.length -1).map(c => c.trim()));

                    return (
                      <div 
                        key={segment.id}
                        id={`segment-${index}`}
                        style={activeStyle}
                        onClick={() => handleSegmentClick(index)}
                        className={`px-4 py-2 ${commonClasses} overflow-x-auto`}
                      >
                        {!isActive && (
                          <div className="absolute -left-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <div className="bg-gray-800 text-white p-1 rounded-full shadow-md"><TableIcon size={10} /></div>
                          </div>
                        )}
                        <table className="min-w-full text-xs text-left border border-gray-200 rounded overflow-hidden">
                          <thead className="bg-gray-50 font-semibold text-gray-700">
                             <tr>
                               {headers.map((h, i) => <th key={i} className="px-3 py-1.5 border-b border-gray-200">{h}</th>)}
                             </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                             {bodyRows.map((row, i) => (
                               <tr key={i} className="hover:bg-gray-50/80 transition-colors">
                                 {row.map((cell, j) => <td key={j} className="px-3 py-1.5 text-gray-600"><InlineMarkdown text={cell} /></td>)}
                               </tr>
                             ))}
                          </tbody>
                        </table>
                      </div>
                    );
                  }

                  // --- TEXT ---
                  return (
                    <div 
                      key={segment.id}
                      id={`segment-${index}`}
                      style={activeStyle}
                      onClick={() => handleSegmentClick(index)}
                      className={`px-4 py-1.5 ${commonClasses}`}
                    >
                      {!isActive && (
                        <div className="absolute -left-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <div className="bg-gray-800 text-white p-1 rounded-full shadow-md"><Play size={10} fill="currentColor" /></div>
                        </div>
                      )}
                      <p className="text-sm leading-6 text-gray-700 whitespace-pre-wrap">
                        <InlineMarkdown text={segment.content} />
                      </p>
                    </div>
                  );
                })}
                
                {segments.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-40 text-gray-400 text-sm">
                    <p>编辑器中没有内容</p>
                  </div>
                )}
                <div className="h-40"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}