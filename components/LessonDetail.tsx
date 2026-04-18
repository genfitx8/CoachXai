
import React, { useState, useRef, useEffect } from 'react';
import { Lesson, MediaItem, SwingSequenceItem, HoleRecord, ScorecardDetail, VideoEditMetadata } from '../types';
import { Button } from './Button';
import { ArrowLeft, Calendar, User, Sparkles, Mic, Plus, Video, Image as ImageIcon, X, Camera, Square, Trash2, Mic2, PlayCircle, Lock, PenTool, Save, Target, AlertTriangle, MessageCircle, CheckCircle, AlertCircle, Clock, Volume2, StopCircle, Copy, Check, Film, ChevronRight, FileText, ScanLine, MonitorPlay, Scissors, GripHorizontal, RefreshCw, Maximize2, Zap, Play, Pause, ListChecks, Trophy, Wand2, MapPin, Edit2, TrendingUp, Send } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { analyzeSwingVideo } from '../services/geminiService';
import { SwingGuideOverlay } from './SwingGuideOverlay';
import { GolfDataVisualizer } from './GolfDataVisualizer';
import { VideoEditor } from './VideoEditor';
import { firebaseService } from '../services/firebase';
import { storageService } from '../services/storage';
import { sendLessonNoteViaKakao, buildLessonShareUrl } from '../services/kakaoShareService';


interface LessonDetailProps {
  lesson: Lesson;
  allLessons?: Lesson[];
  role?: 'COACH' | 'CLIENT';
  onBack: () => void;
  onUpdate: (lesson: Lesson) => void;
  onDelete?: () => void;
  onEdit?: (lesson: Lesson) => void; // Added for full editing
}

const SEQUENCE_LABELS = [
    "어드레스", "테이크어웨이", "하프스윙", "탑", 
    "다운스윙", "임팩트", "팔로우스루", "피니쉬"
];

export const LessonDetail: React.FC<LessonDetailProps> = ({ lesson, allLessons = [], role = 'COACH', onBack, onUpdate, onDelete, onEdit }) => {
  const [activeMedia, setActiveMedia] = useState<MediaItem>({
    id: 'main',
    url: lesson.videoUrl,
    type: lesson.mediaType,
    createdAt: lesson.createdAt
  });
  
  const [isAddingMedia, setIsAddingMedia] = useState(false);
  const [addMode, setAddMode] = useState<'SELECT' | 'CAMERA' | 'VOICE' | 'PREVIEW'>('SELECT');
  const [capturedMedia, setCapturedMedia] = useState<{url: string, type: 'video'|'image'|'audio'} | null>(null);
  const [mediaError, setMediaError] = useState(false);
  const [recordingAngle, setRecordingAngle] = useState<'FRONT' | 'SIDE'>('FRONT');

  const [isCommentaryMode, setIsCommentaryMode] = useState(false);
  const [isSequenceMode, setIsSequenceMode] = useState(false);
  const [selectedSequenceImage, setSelectedSequenceImage] = useState<string | null>(null);
  
  const [clientNoteText, setClientNoteText] = useState(lesson.clientFeedback?.text || '');
  const [clientVoicePreviewUrl, setClientVoicePreviewUrl] = useState<string | null>(lesson.clientFeedback?.voiceUrl || null);
  const [isClientRecording, setIsClientRecording] = useState(false);

  const [isSpeaking, setIsSpeaking] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isGeneratingAnalysis, setIsGeneratingAnalysis] = useState(false);
  const [tempNotification, setTempNotification] = useState<string | null>(null);
  
  // Scorecard Edit Mode
  const [isEditingScorecardDetail, setIsEditingScorecardDetail] = useState(false);
  const [editingCourseName, setEditingCourseName] = useState('');
  const [editingHoles, setEditingHoles] = useState<HoleRecord[]>([]);

  // Video Player State
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  // Video Editor State
  const [showVideoEditor, setShowVideoEditor] = useState(false);

  // KakaoTalk Share State
  const [kakaoShareStatus, setKakaoShareStatus] = useState<'idle' | 'loading' | 'no_key' | 'error'>('idle');
  const [linkCopied, setLinkCopied] = useState(false);


  const mediaElementRef = useRef<HTMLMediaElement>(null);
  const videoPreviewRef = useRef<HTMLVideoElement>(null); 

  const streamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<number | null>(null);

  const isClientView = role === 'CLIENT';
  // Always show analysis unless explicitly restricted (which we are removing, so default to showing if exists)
  const showAiAnalysis = true; 
  const hasGolfData = !!lesson.golfData;

  // Permissions: Coach can edit all, Client can edit only their own records
  const canEdit = !isClientView || lesson.createdBy === 'CLIENT';
  
  // Permission for Edit/Delete buttons: Users can edit/delete records they created
  const canEditOrDelete = 
    (role === 'CLIENT' && lesson.createdBy === 'CLIENT') ||  // 클라이언트는 본인 기록만 수정 가능
    (role === 'COACH' && lesson.createdBy === 'COACH');      // 코치는 코치가 작성한 레슨만 수정 가능

  // Check if this record is suitable for Swing Sequence (Not a Scorecard)
  const isSwingRecord = lesson.recordType !== 'SCORE';

  useEffect(() => {
    setActiveMedia({
      id: 'main',
      url: lesson.videoUrl,
      type: lesson.mediaType,
      createdAt: lesson.createdAt
    });
    resetPlayerState();
    setClientNoteText(lesson.clientFeedback?.text || '');
    setClientVoicePreviewUrl(lesson.clientFeedback?.voiceUrl || null);
    
    // Initialize scorecard editing state
    if (lesson.scorecardDetail) {
      setEditingCourseName(lesson.scorecardDetail.courseName);
      setEditingHoles(JSON.parse(JSON.stringify(lesson.scorecardDetail.holes)));
    }
    setIsEditingScorecardDetail(false);
  }, [lesson.id, lesson.clientFeedback, lesson.scorecardDetail]);

  useEffect(() => {
      setMediaError(false);
      resetPlayerState();
  }, [activeMedia.id]);

  useEffect(() => {
    if (addMode === 'CAMERA' && videoPreviewRef.current && streamRef.current) {
        videoPreviewRef.current.srcObject = streamRef.current;
    }
  }, [addMode]);

  useEffect(() => {
      return () => {
          if (typeof window !== 'undefined' && window.speechSynthesis) {
              window.speechSynthesis.cancel();
          }
      };
  }, []);

  const resetPlayerState = () => {
      setIsPlaying(false);
      setCurrentTime(0);
      setDuration(0);
      setMediaError(false);
  };

  const handleSpeakAnalysis = () => {
    if (!lesson.aiAnalysis || typeof window === 'undefined') return;
    
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(lesson.aiAnalysis);
    utterance.lang = 'ko-KR';
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.onend = () => setIsSpeaking(false);
    
    window.speechSynthesis.speak(utterance);
    setIsSpeaking(true);
  };

  const handleStopSpeak = () => {
    if (typeof window === 'undefined') return;
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
  };

  const handleCopyAnalysis = () => {
    if (lesson.aiAnalysis) {
        navigator.clipboard.writeText(lesson.aiAnalysis).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    }
  };

  const handleGenerateAIAnalysis = async () => {
      setIsGeneratingAnalysis(true);
      try {
          const allMediaItems = [
              { url: lesson.videoUrl, type: lesson.mediaType },
              ...(lesson.additionalMedia || []).map(m => ({ url: m.url, type: m.type }))
          ];

          const inputs = allMediaItems.map(m => {
             let mime = 'video/mp4';
             if (m.type === 'image') mime = 'image/jpeg';
             if (m.type === 'audio') mime = 'audio/mp4';
             
             return { data: m.url, mimeType: mime };
          });

          const result = await analyzeSwingVideo(inputs, lesson.coachNotes || "", lesson.swingAngle);
          
          onUpdate({ ...lesson, aiAnalysis: result });
      } catch (err) {
          console.error(err);
          alert("AI 분석 생성에 실패했습니다.");
      } finally {
          setIsGeneratingAnalysis(false);
      }
  };

  const handleOpenVideoEditor = () => {
    if (lesson.mediaType !== 'video') {
      alert('비디오 파일만 편집할 수 있습니다.');
      return;
    }
    setShowVideoEditor(true);
  };

  const handleSaveEditedVideo = async (editedBlob: Blob, metadata: VideoEditMetadata) => {
    try {
      // Try to upload to Firebase if available
      let editedUrl: string;
      
      if (firebaseService.isInitialized()) {
        const userId = lesson.coachId || 'unknown';
        editedUrl = await firebaseService.uploadEditedVideo(editedBlob, lesson.id, userId);
      } else {
        // Fallback to blob URL for local storage
        editedUrl = URL.createObjectURL(editedBlob);
      }

      const updatedLesson: Lesson = {
        ...lesson,
        editedVideoUrl: editedUrl,
        videoEditMetadata: metadata,
      };

      onUpdate(updatedLesson);
      setShowVideoEditor(false);
      alert('편집된 영상이 저장되었습니다.');
    } catch (error) {
      console.error('Error saving edited video:', error);
      alert('편집된 영상 저장 중 오류가 발생했습니다.');
    }
  };


  const handleDeleteMedia = (mediaId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("정말 삭제하시겠습니까?")) return;

    const updatedAdditional = (lesson.additionalMedia || []).filter(m => m.id !== mediaId);
    
    if (activeMedia.id === mediaId) {
        setActiveMedia({
            id: 'main',
            url: lesson.videoUrl,
            type: lesson.mediaType,
            createdAt: lesson.createdAt
        });
    }

    onUpdate({ ...lesson, additionalMedia: updatedAdditional });
  };

  const handleDeleteLesson = () => {
      if (onDelete && confirm("정말 이 레슨 기록을 삭제하시겠습니까? 복구할 수 없습니다.")) {
          onDelete();
      }
  };

  const showTempNotification = (msg: string) => {
      setTempNotification(msg);
      setTimeout(() => setTempNotification(null), 2000);
  };

  // --- Video Controls ---
  const togglePlay = () => {
      if (mediaElementRef.current) {
          if (mediaElementRef.current.paused) {
              mediaElementRef.current.play();
          } else {
              mediaElementRef.current.pause();
          }
          // Note: State update is handled by onPlay/onPause events
      }
  };

  const handleTimeUpdate = () => {
      if (mediaElementRef.current) {
          setCurrentTime(mediaElementRef.current.currentTime);
      }
  };

  const handleLoadedMetadata = () => {
      if (mediaElementRef.current) {
          setDuration(mediaElementRef.current.duration);
      }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
      const time = parseFloat(e.target.value);
      setCurrentTime(time);
      if (mediaElementRef.current) {
          mediaElementRef.current.currentTime = time;
      }
  };

  // --- Swing Sequence Logic ---
  
  // Manual Capture
  const handleCaptureFrame = (label: string, e: React.MouseEvent) => {
      e.stopPropagation(); // Prevent affecting video controls
      
      if (!mediaElementRef.current) return;
      const video = mediaElementRef.current as HTMLVideoElement;
      
      if (video.tagName !== 'VIDEO') {
          alert("동영상 재생 중에만 캡처할 수 있습니다.");
          return;
      }

      if (video.readyState < 2 || video.videoWidth === 0) {
          alert("비디오가 아직 로드되지 않았습니다.");
          return;
      }

      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      
      if (ctx) {
          try {
              ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
              // Use higher quality jpeg
              const imageUrl = canvas.toDataURL('image/jpeg', 0.9);
              
              const newItem: SwingSequenceItem = {
                  id: crypto.randomUUID(),
                  label,
                  imageUrl,
                  timestamp: video.currentTime
              };

              // Replace existing label if it exists, otherwise add new
              const currentSeq = lesson.swingSequence || [];
              const updatedSeq = [...currentSeq.filter(item => item.label !== label), newItem];
              
              // Sort by predefined order
              updatedSeq.sort((a, b) => SEQUENCE_LABELS.indexOf(a.label) - SEQUENCE_LABELS.indexOf(b.label));

              onUpdate({ ...lesson, swingSequence: updatedSeq });
              showTempNotification(`${label} 캡처 완료!`);
          } catch (e) {
              console.error(e);
              alert("이미지 캡처에 실패했습니다. (보안 정책으로 인해 외부 영상은 캡처가 제한될 수 있습니다)");
          }
      }
  };

  const handleRemoveSequenceItem = (id: string) => {
      if (!confirm("이 동작 이미지를 삭제하시겠습니까?")) return;
      const updatedSeq = (lesson.swingSequence || []).filter(item => item.id !== id);
      onUpdate({ ...lesson, swingSequence: updatedSeq });
  };

  const stopMediaStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoPreviewRef.current) videoPreviewRef.current.srcObject = null;
    setIsRecording(false);
    setIsClientRecording(false);
    if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
    }
    setRecordingTime(0);
  };

  const startCamera = async () => {
    try {
      stopMediaStream();
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'user' }, 
        audio: true 
      });
      streamRef.current = stream;
      setAddMode('CAMERA');
    } catch (err) {
      console.error(err);
      alert("카메라 접근 권한이 필요합니다.");
    }
  };

  const startRecordingAudio = async (forClientFeedback = false) => {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;
        
        chunksRef.current = [];
        const mimeType = MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : 'audio/webm';
        const recorder = new MediaRecorder(stream, { mimeType });
        mediaRecorderRef.current = recorder;

        recorder.ondataavailable = (e) => {
            if (e.data.size > 0) chunksRef.current.push(e.data);
        };

        recorder.onstop = async () => {
            const blob = new Blob(chunksRef.current, { type: mimeType });
            
            if (forClientFeedback) {
                const reader = new FileReader();
                reader.readAsDataURL(blob);
                reader.onloadend = () => {
                    setClientVoicePreviewUrl(reader.result as string);
                };
            } else {
                const url = URL.createObjectURL(blob);
                setCapturedMedia({ url, type: 'audio' });
                if (!isCommentaryMode) {
                    setAddMode('PREVIEW'); 
                } else {
                     if (mediaElementRef.current) mediaElementRef.current.pause();
                }
            }
            
            stream.getTracks().forEach(t => t.stop()); 
            streamRef.current = null;
            
            setIsRecording(false);
            setIsClientRecording(false);
            if (timerRef.current) {
                clearInterval(timerRef.current);
                timerRef.current = null;
            }
            setRecordingTime(0);
        };

        recorder.start();
        if (forClientFeedback) {
            setIsClientRecording(true);
        } else {
            setIsRecording(true);
            // Switch UI to recording mode if in the main Add Media modal
            if (!isCommentaryMode) {
                setAddMode('VOICE');
            }
        }
        
        setRecordingTime(0);
        timerRef.current = window.setInterval(() => setRecordingTime(p => p + 1), 1000);

        if (isCommentaryMode && mediaElementRef.current) {
            mediaElementRef.current.currentTime = 0;
            mediaElementRef.current.play();
        }

    } catch (err) {
        console.error(err);
        alert("마이크 접근 권한이 필요합니다.");
    }
  };

  const startRecordingVideo = () => {
    if (!streamRef.current) return;
    chunksRef.current = [];
    const mimeType = MediaRecorder.isTypeSupported('video/mp4') ? 'video/mp4' : 'video/webm';
    
    const recorder = new MediaRecorder(streamRef.current, { mimeType });
    mediaRecorderRef.current = recorder;
    
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mimeType });
      const url = URL.createObjectURL(blob);
      setCapturedMedia({ url, type: 'video' });
      setAddMode('PREVIEW');
      stopMediaStream();
    };
    
    recorder.start();
    setIsRecording(true);
    setRecordingTime(0);
    timerRef.current = window.setInterval(() => setRecordingTime(p => p+1), 1000);
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && (isRecording || isClientRecording)) {
      mediaRecorderRef.current.stop();
    }
  };

  const takePhoto = () => {
      if (!streamRef.current || !videoPreviewRef.current) return;
      
      const canvas = document.createElement('canvas');
      canvas.width = videoPreviewRef.current.videoWidth;
      canvas.height = videoPreviewRef.current.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
          ctx.drawImage(videoPreviewRef.current, 0, 0);
          canvas.toBlob((blob) => {
              if (blob) {
                  const url = URL.createObjectURL(blob);
                  setCapturedMedia({ url, type: 'image' });
                  setAddMode('PREVIEW');
                  stopMediaStream();
              }
          }, 'image/jpeg');
      }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || files.length === 0) return;

      if (files.length === 1) {
          const file = files[0];
          const url = URL.createObjectURL(file);
          let type: 'video'|'image'|'audio' = 'video';
          if (file.type.startsWith('image/')) type = 'image';
          else if (file.type.startsWith('audio/')) type = 'audio';

          setCapturedMedia({ url, type });
          setAddMode('PREVIEW');
      } else {
          const newItems: MediaItem[] = Array.from(files).map((file: File) => {
             const url = URL.createObjectURL(file);
             let type: 'video'|'image'|'audio' = 'video';
             if (file.type.startsWith('image/')) type = 'image';
             else if (file.type.startsWith('audio/')) type = 'audio';
             
             return {
                 id: crypto.randomUUID(),
                 url,
                 type,
                 createdAt: Date.now()
             };
          });

          const updatedLesson: Lesson = {
              ...lesson,
              additionalMedia: [...(lesson.additionalMedia || []), ...newItems]
          };
          
          onUpdate(updatedLesson);
          closeAddModal();
          alert(`${newItems.length}개의 미디어가 추가되었습니다.`);
      }
      
      e.target.value = '';
  };

  const saveAdditionalMedia = () => {
      if (!capturedMedia) return;
      
      const newItem: MediaItem = {
          id: crypto.randomUUID(),
          url: capturedMedia.url,
          type: capturedMedia.type,
          createdAt: Date.now()
      };

      const updatedLesson: Lesson = {
          ...lesson,
          additionalMedia: [...(lesson.additionalMedia || []), newItem]
      };
      
      onUpdate(updatedLesson);
      closeAddModal();
      closeCommentaryModal();
  };

  const saveClientFeedback = () => {
      const updatedLesson: Lesson = {
          ...lesson,
          clientFeedback: {
              text: clientNoteText,
              voiceUrl: clientVoicePreviewUrl || undefined,
              updatedAt: Date.now()
          }
      };
      onUpdate(updatedLesson);
      alert('저장되었습니다.');
  };

  const handleRequestFeedback = () => {
      if (confirm('회원님께 피드백 작성을 요청하시겠습니까?')) {
          onUpdate({ ...lesson, feedbackStatus: 'REQUESTED' });
          showTempNotification('피드백 요청이 전송되었습니다.');
      }
  };

  const handleSaveScorecardEdit = () => {
      if (!editingCourseName.trim()) {
          alert('코스 이름을 입력해주세요.');
          return;
      }

      // Validate scores
      const hasInvalidScore = editingHoles.some(h => h.score <= 0 || h.par <= 0);
      if (hasInvalidScore) {
          alert('모든 홀의 Par와 Score를 올바르게 입력해주세요.');
          return;
      }

      const totalScore = editingHoles.reduce((sum, h) => sum + h.score, 0);
      const totalPutts = editingHoles.reduce((sum, h) => sum + h.putts, 0);

      const updatedScorecardDetail: ScorecardDetail = {
          courseName: editingCourseName.trim(),
          holes: editingHoles,
          totalScore,
          totalPutts
      };

      const updatedLesson: Lesson = {
          ...lesson,
          scorecardDetail: updatedScorecardDetail,
          score: totalScore
      };

      onUpdate(updatedLesson);
      setIsEditingScorecardDetail(false);
      showTempNotification('스코어 카드가 수정되었습니다!');
  };

  const closeAddModal = () => {
      setIsAddingMedia(false);
      setAddMode('SELECT');
      setCapturedMedia(null);
      stopMediaStream();
  };

  const closeCommentaryModal = () => {
      setIsCommentaryMode(false);
      stopMediaStream();
      setCapturedMedia(null);
  };

  const handleCompleteSequence = () => {
      setIsSequenceMode(false);
      setSelectedSequenceImage(null);
  };

  const handleViewSequenceImage = (imageUrl: string) => {
      setSelectedSequenceImage(imageUrl);
  };

  const handleKakaoShare = async () => {
      setKakaoShareStatus('loading');
      const result = await sendLessonNoteViaKakao(lesson);
      if (result === 'success') {
          setKakaoShareStatus('idle');
      } else if (result === 'no_key') {
          setKakaoShareStatus('no_key');
          setTimeout(() => setKakaoShareStatus('idle'), 6000);
      } else {
          setKakaoShareStatus('error');
          setTimeout(() => setKakaoShareStatus('idle'), 4000);
      }
  };

  const handleCopyLink = async () => {
      const url = buildLessonShareUrl(lesson);
      try {
          await navigator.clipboard.writeText(url);
          setLinkCopied(true);
          setTimeout(() => setLinkCopied(false), 2500);
      } catch {
          // Fallback for browsers without Clipboard API: create a temporary input
          const input = document.createElement('input');
          input.value = url;
          document.body.appendChild(input);
          input.select();
          // eslint-disable-next-line @typescript-eslint/no-deprecated
          const success = document.execCommand('copy');
          document.body.removeChild(input);
          if (success) {
              setLinkCopied(true);
              setTimeout(() => setLinkCopied(false), 2500);
          }
      }
  };

  useEffect(() => {
      if (isAddingMedia || isCommentaryMode || isSequenceMode || selectedSequenceImage) {
          document.body.style.overflow = 'hidden';
      } else {
          document.body.style.overflow = 'unset';
      }
  }, [isAddingMedia, isCommentaryMode, isSequenceMode, selectedSequenceImage]);

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col h-full overflow-hidden animate-fade-in">
      {/* ... (Header and Main Content rendering remains same) ... */}
      {/* Header */}
      <div className="bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 px-4 py-3 flex items-center justify-between text-white flex-shrink-0 safe-area-top relative shadow-lg">
        <div className="w-10"></div> {/* Spacer for center alignment */}
        <h2 className="text-lg font-bold truncate max-w-[200px] text-center">{lesson.title}</h2>
        <div className="w-10 flex justify-end">
            {canEdit && onEdit && (
                <button 
                    onClick={() => onEdit(lesson)} 
                    className="p-2 bg-white/10 backdrop-blur-sm rounded-full hover:bg-white/20 text-white transition-all duration-200 hover:scale-110 transform"
                    title="기록 수정"
                >
                    <Edit2 className="w-4 h-4" />
                </button>
            )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto bg-gray-50 custom-scrollbar safe-area-bottom">
        <div className="max-w-4xl mx-auto p-4 space-y-6">

          {/* Media Player Section - Only if URL exists */}
          {lesson.videoUrl ? (
             <div className="space-y-3">
              <div className="bg-black rounded-xl overflow-hidden shadow-2xl relative aspect-[9/16] group max-w-md mx-auto">
                    <div 
                        className="relative w-full h-full bg-black flex items-center justify-center cursor-pointer group"
                        onClick={togglePlay}
                    >
                        {activeMedia.type === 'video' ? (
                            activeMedia.url ? (
                            <video
                                ref={mediaElementRef as React.RefObject<HTMLVideoElement>}
                                src={activeMedia.url}
                                className="w-full h-full object-contain bg-black"
                                playsInline
                                onTimeUpdate={handleTimeUpdate}
                                onLoadedMetadata={handleLoadedMetadata}
                                onEnded={() => setIsPlaying(false)}
                                key={activeMedia.url}
                                crossOrigin="anonymous" 
                                onPlay={() => setIsPlaying(true)}
                                onPause={() => setIsPlaying(false)}
                            />
                            ) : (
                                <div className="w-full h-full flex flex-col items-center justify-center text-gray-500">
                                    <AlertCircle className="w-10 h-10 mb-2 opacity-50" />
                                    <p className="text-sm">비디오를 재생할 수 없습니다.</p>
                                </div>
                            )
                        ) : activeMedia.type === 'image' ? (
                            <img src={activeMedia.url} className="w-full h-full object-contain" alt="Lesson Media" />
                        ) : (
                            <div className="text-center p-8">
                                <div className="w-20 h-20 bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse">
                                    <Mic className="w-10 h-10 text-emerald-400" />
                                </div>
                                <h3 className="text-white font-bold mb-2">음성 녹음</h3>
                                <audio src={activeMedia.url} controls className="mt-4" />
                            </div>
                        )}
                        
                        {/* Play Overlay */}
                        {activeMedia.type === 'video' && activeMedia.url && !isPlaying && (
                            <div className="absolute inset-0 flex items-center justify-center bg-black/20 z-10 pointer-events-none">
                                <PlayCircle className="w-16 h-16 text-white opacity-80" />
                            </div>
                        )}
                    </div>

                    {/* Custom Video Controls */}
                    {activeMedia.type === 'video' && activeMedia.url && (
                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/95 via-black/60 to-transparent p-4 opacity-0 group-hover:opacity-100 transition-opacity duration-300 backdrop-blur-sm">
                             <div className="flex items-center gap-3">
                                 <button onClick={togglePlay} className="text-white hover:text-emerald-400 transition-all duration-200 hover:scale-110 transform">
                                     {isPlaying ? <Pause className="w-6 h-6 fill-current" /> : <Play className="w-6 h-6 fill-current" />}
                                 </button>
                                 <div className="flex-1 relative h-2 bg-white/20 rounded-full cursor-pointer group/slider overflow-hidden">
                                     <div 
                                        className="absolute top-0 left-0 h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full shadow-lg shadow-emerald-500/50" 
                                        style={{ width: `${(currentTime / (duration || 1)) * 100}%` }}
                                     />
                                     <input 
                                        type="range" 
                                        min="0" 
                                        max={duration || 0} 
                                        step="0.1"
                                        value={currentTime}
                                        onChange={handleSeek}
                                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                     />
                                 </div>
                                 <span className="text-xs text-white font-mono tabular-nums font-semibold">
                                     {Math.floor(currentTime/60)}:{Math.floor(currentTime%60).toString().padStart(2,'0')}
                                 </span>
                                 <button onClick={(e) => handleCaptureFrame('스냅샷', e)} className="text-white hover:text-emerald-400 transition-all duration-200 hover:scale-110 transform">
                                     <Camera className="w-5 h-5" />
                                 </button>
                             </div>
                        </div>
                    )}
                    
                    {/* Media Type Badge */}
                    <div className="absolute top-3 left-3 bg-black/60 backdrop-blur-md px-2 py-1 rounded-lg text-xs font-bold text-white flex items-center gap-1 z-20">
                        {activeMedia.type === 'video' ? <Video className="w-3 h-3" /> : activeMedia.type === 'image' ? <ImageIcon className="w-3 h-3" /> : <Mic className="w-3 h-3" />}
                        {activeMedia.type.toUpperCase()}
                    </div>
              </div>

              {/* Media Thumbnails */}
              <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide px-1">
                  <button 
                    onClick={() => setActiveMedia({ id: 'main', url: lesson.videoUrl, type: lesson.mediaType, createdAt: lesson.createdAt })}
                    className={`relative w-16 h-16 flex-shrink-0 rounded-lg overflow-hidden border-2 transition-all ${activeMedia.id === 'main' ? 'border-emerald-500 ring-2 ring-emerald-200' : 'border-transparent opacity-70 hover:opacity-100'}`}
                  >
                      {lesson.mediaType === 'video' ? <video src={lesson.videoUrl} className="w-full h-full object-cover" /> : 
                       lesson.mediaType === 'image' ? <img src={lesson.videoUrl} className="w-full h-full object-cover" alt="thumb" /> :
                       <div className="w-full h-full bg-gray-800 flex items-center justify-center"><Mic className="w-6 h-6 text-white" /></div>}
                  </button>
                  
                  {lesson.additionalMedia?.map(media => (
                      <div key={media.id} className="relative group flex-shrink-0">
                          <button 
                            onClick={() => setActiveMedia(media)}
                            className={`w-16 h-16 rounded-lg overflow-hidden border-2 transition-all ${activeMedia.id === media.id ? 'border-emerald-500 ring-2 ring-emerald-200' : 'border-transparent opacity-70 hover:opacity-100'}`}
                          >
                            {media.type === 'video' ? <video src={media.url} className="w-full h-full object-cover" /> : 
                             media.type === 'image' ? <img src={media.url} className="w-full h-full object-cover" alt="thumb" /> :
                             <div className="w-full h-full bg-gray-800 flex items-center justify-center"><Mic className="w-6 h-6 text-white" /></div>}
                          </button>
                          {canEdit && (
                              <button 
                                onClick={(e) => handleDeleteMedia(media.id, e)}
                                className="absolute -top-1 -right-1 bg-red-500 text-white p-0.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-sm z-10"
                              >
                                  <X className="w-3 h-3" />
                              </button>
                          )}
                      </div>
                  ))}
                  
                  {canEdit && (
                      <button 
                        onClick={() => setIsAddingMedia(true)}
                        className="w-16 h-16 flex-shrink-0 rounded-lg border-2 border-dashed border-gray-300 flex flex-col items-center justify-center text-gray-400 hover:text-emerald-500 hover:border-emerald-300 hover:bg-emerald-50 transition-all gap-1"
                      >
                          <Plus className="w-5 h-5" />
                          <span className="text-[10px] font-bold">추가</span>
                      </button>
                  )}
              </div>

               {/* Video Editor Button */}
               {activeMedia.type === 'video' && canEdit && (
                   <div className="flex justify-center pt-2">
                       <Button
                           onClick={handleOpenVideoEditor}
                           className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700"
                           size="sm"
                       >
                           <Scissors className="w-4 h-4" />
                           영상 편집
                       </Button>
                   </div>
               )}

               {/* Manual Capture Toolbar - Restrict to Swing Videos */}
               {activeMedia.type === 'video' && activeMedia.url && canEdit && isSwingRecord && (
                    <div className="flex flex-wrap gap-2 justify-center pt-2 animate-fade-in">
                        {SEQUENCE_LABELS.map((phase) => (
                            <button
                                key={phase}
                                onClick={(e) => handleCaptureFrame(phase, e)}
                                className="px-2 py-1 bg-white border border-gray-200 rounded text-[10px] font-medium text-gray-600 hover:bg-emerald-50 hover:text-emerald-600 hover:border-emerald-200 transition-colors flex items-center gap-1"
                            >
                                <Camera className="w-3 h-3" /> {phase}
                            </button>
                        ))}
                    </div>
               )}

              {/* Swing Sequence Strip - Only show if relevant (not Score record) */}
              {isSwingRecord && (
                  <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mt-0">
                       <div className="flex justify-between items-center mb-4">
                           <h3 className="font-bold text-gray-900 flex items-center gap-2">
                               <Film className="w-4 h-4 text-gray-500" /> 스윙 시퀀스
                           </h3>
                       </div>
                       
                       {(!lesson.swingSequence || lesson.swingSequence.length === 0) ? (
                           <div className="text-center py-6 bg-gray-50 rounded-lg border border-dashed border-gray-200 text-gray-400 text-sm">
                               추출된 스윙 동작이 없습니다.
                           </div>
                       ) : (
                           <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
                               {lesson.swingSequence.map((item) => (
                                   <div key={item.id} className="relative group cursor-pointer" onClick={() => handleViewSequenceImage(item.imageUrl)}>
                                       <div className="aspect-[3/4] rounded-lg overflow-hidden border border-gray-200 bg-gray-100">
                                           <img src={item.imageUrl} className="w-full h-full object-cover" alt={item.label} />
                                       </div>
                                       <div className="mt-1 text-center">
                                           <span className="text-[10px] font-bold text-gray-600 block truncate">{item.label}</span>
                                       </div>
                                       {canEdit && (
                                           <button 
                                                onClick={(e) => { e.stopPropagation(); handleRemoveSequenceItem(item.id); }}
                                                className="absolute top-0 right-0 bg-red-500 text-white p-0.5 rounded-bl-lg opacity-0 group-hover:opacity-100 transition-opacity"
                                           >
                                               <X className="w-3 h-3" />
                                           </button>
                                       )}
                                   </div>
                               ))}
                           </div>
                       )}
                  </div>
              )}
          </div>
          ) : null}

          {/* ... (Rest of content: Assigned Homework, Scorecard, AI Analysis, etc.) ... */}
          {/* Assigned Homework Section */}
          {lesson.assignedHomework && lesson.assignedHomework.length > 0 && (
              <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 shadow-sm">
                  <h3 className="text-sm font-bold text-indigo-900 mb-3 flex items-center gap-2">
                      <ListChecks className="w-4 h-4 text-indigo-600" /> 이번 레슨의 과제 (Homework)
                  </h3>
                  <ul className="space-y-2">
                      {lesson.assignedHomework.map((hw, idx) => (
                          <li key={idx} className="bg-white p-3 rounded-lg border border-indigo-50 text-sm flex items-start gap-2 text-gray-700 shadow-sm">
                              <CheckCircle className="w-4 h-4 text-indigo-400 mt-0.5 flex-shrink-0" />
                              {hw}
                          </li>
                      ))}
                  </ul>
              </div>
          )}

          {/* Detailed Scorecard View */}
          {lesson.scorecardDetail && (
              <div className="bg-white rounded-xl shadow-lg border border-blue-100/50 overflow-hidden">
                   <div className="bg-gradient-to-r from-blue-600 via-blue-700 to-blue-600 px-4 py-3 flex justify-between items-center text-white shadow-xl">
                        <div className="flex items-center gap-2">
                            <MapPin className="w-5 h-5 text-yellow-300" />
                            <div>
                                {isEditingScorecardDetail ? (
                                    <input
                                        type="text"
                                        value={editingCourseName}
                                        onChange={(e) => setEditingCourseName(e.target.value)}
                                        className="bg-white/20 backdrop-blur-sm text-white font-bold px-2 py-1 rounded-lg border-2 border-white/40 focus:border-white outline-none"
                                        placeholder="골프장 이름"
                                    />
                                ) : (
                                    <h3 className="font-bold">{lesson.scorecardDetail.courseName}</h3>
                                )}
                                <p className="text-[10px] text-blue-100 font-medium">Detailed Scorecard</p>
                            </div>
                        </div>
                        <div className="text-right">
                             <div className="text-xl font-bold">{isEditingScorecardDetail ? editingHoles.reduce((sum, h) => sum + h.score, 0) : lesson.scorecardDetail.totalScore}타</div>
                             <div className="text-[10px] text-blue-100 opacity-90 font-medium">퍼팅 {isEditingScorecardDetail ? editingHoles.reduce((sum, h) => sum + h.putts, 0) : lesson.scorecardDetail.totalPutts}</div>
                             {canEdit && (
                                 <button
                                     onClick={() => {
                                         if (isEditingScorecardDetail) {
                                             handleSaveScorecardEdit();
                                         } else {
                                             setIsEditingScorecardDetail(true);
                                         }
                                     }}
                                     className="mt-2 bg-white/20 hover:bg-white/30 backdrop-blur-sm px-3 py-1 rounded-full text-xs font-bold transition-all duration-200 flex items-center gap-1 hover:scale-105 transform"
                                 >
                                     {isEditingScorecardDetail ? (
                                         <><Save className="w-3 h-3" /> 저장</>
                                     ) : (
                                         <><Edit2 className="w-3 h-3" /> 수정</>
                                     )}
                                 </button>
                             )}
                        </div>
                   </div>
                   
                   <div className="overflow-x-auto">
                        <table className="w-full text-center text-xs">
                             <thead className="bg-gray-50 text-gray-500">
                                 <tr>
                                     <th className="py-2 px-1">Hole</th>
                                     {(isEditingScorecardDetail ? editingHoles : lesson.scorecardDetail.holes).slice(0, 9).map(h => <th key={h.holeNumber} className="py-2 px-1 w-8">{h.holeNumber}</th>)}
                                 </tr>
                             </thead>
                             <tbody className="divide-y divide-gray-100">
                                 <tr>
                                     <td className="font-bold bg-gray-50 text-gray-600 py-2">Par</td>
                                     {(isEditingScorecardDetail ? editingHoles : lesson.scorecardDetail.holes).slice(0, 9).map(h => (
                                         isEditingScorecardDetail ? (
                                             <td key={h.holeNumber} className="py-2">
                                                 <input
                                                     type="number"
                                                     value={h.par}
                                                     onChange={(e) => {
                                                         const val = parseInt(e.target.value) || 0;
                                                         setEditingHoles(prev => prev.map(hole => 
                                                             hole.holeNumber === h.holeNumber ? {...hole, par: val} : hole
                                                         ));
                                                     }}
                                                     className="w-10 text-center bg-white border border-gray-300 rounded px-1 py-0.5 focus:ring-2 focus:ring-blue-500 outline-none"
                                                     min="3"
                                                     max="5"
                                                 />
                                             </td>
                                         ) : (
                                             <td key={h.holeNumber} className="py-2">{h.par}</td>
                                         )
                                     ))}
                                 </tr>
                                 <tr>
                                     <td className="font-bold bg-gray-50 text-gray-600 py-2">Score</td>
                                     {(isEditingScorecardDetail ? editingHoles : lesson.scorecardDetail.holes).slice(0, 9).map(h => (
                                         isEditingScorecardDetail ? (
                                             <td key={h.holeNumber} className="py-2">
                                                 <input
                                                     type="number"
                                                     value={h.score}
                                                     onChange={(e) => {
                                                         const val = parseInt(e.target.value) || 0;
                                                         setEditingHoles(prev => prev.map(hole => 
                                                             hole.holeNumber === h.holeNumber ? {...hole, score: val} : hole
                                                         ));
                                                     }}
                                                     className="w-10 text-center bg-white border-2 border-blue-300 rounded px-1 py-0.5 font-bold focus:ring-2 focus:ring-blue-500 outline-none"
                                                     min="1"
                                                     max="15"
                                                 />
                                             </td>
                                         ) : (
                                             <td key={h.holeNumber} className={`py-2 font-bold ${h.score < h.par ? 'text-red-500' : h.score > h.par ? 'text-blue-600' : ''}`}>
                                                 {h.score}
                                             </td>
                                         )
                                     ))}
                                 </tr>
                                 {isEditingScorecardDetail && (
                                     <tr>
                                         <td className="font-bold bg-gray-50 text-gray-600 py-2">Putts</td>
                                         {editingHoles.slice(0, 9).map(h => (
                                             <td key={h.holeNumber} className="py-2">
                                                 <input
                                                     type="number"
                                                     value={h.putts}
                                                     onChange={(e) => {
                                                         const val = parseInt(e.target.value) || 0;
                                                         setEditingHoles(prev => prev.map(hole => 
                                                             hole.holeNumber === h.holeNumber ? {...hole, putts: val} : hole
                                                         ));
                                                     }}
                                                     className="w-10 text-center bg-white border border-emerald-300 rounded px-1 py-0.5 focus:ring-2 focus:ring-emerald-500 outline-none"
                                                     min="0"
                                                     max="10"
                                                 />
                                             </td>
                                         ))}
                                     </tr>
                                 )}
                             </tbody>
                             
                             <thead className="bg-gray-50 text-gray-500 border-t border-gray-200">
                                 <tr>
                                     <th className="py-2 px-1">Hole</th>
                                     {(isEditingScorecardDetail ? editingHoles : lesson.scorecardDetail.holes).slice(9, 18).map(h => <th key={h.holeNumber} className="py-2 px-1 w-8">{h.holeNumber}</th>)}
                                 </tr>
                             </thead>
                             <tbody className="divide-y divide-gray-100">
                                 <tr>
                                     <td className="font-bold bg-gray-50 text-gray-600 py-2">Par</td>
                                     {(isEditingScorecardDetail ? editingHoles : lesson.scorecardDetail.holes).slice(9, 18).map(h => (
                                         isEditingScorecardDetail ? (
                                             <td key={h.holeNumber} className="py-2">
                                                 <input
                                                     type="number"
                                                     value={h.par}
                                                     onChange={(e) => {
                                                         const val = parseInt(e.target.value) || 0;
                                                         setEditingHoles(prev => prev.map(hole => 
                                                             hole.holeNumber === h.holeNumber ? {...hole, par: val} : hole
                                                         ));
                                                     }}
                                                     className="w-10 text-center bg-white border border-gray-300 rounded px-1 py-0.5 focus:ring-2 focus:ring-blue-500 outline-none"
                                                     min="3"
                                                     max="5"
                                                 />
                                             </td>
                                         ) : (
                                             <td key={h.holeNumber} className="py-2">{h.par}</td>
                                         )
                                     ))}
                                 </tr>
                                 <tr>
                                     <td className="font-bold bg-gray-50 text-gray-600 py-2">Score</td>
                                     {(isEditingScorecardDetail ? editingHoles : lesson.scorecardDetail.holes).slice(9, 18).map(h => (
                                         isEditingScorecardDetail ? (
                                             <td key={h.holeNumber} className="py-2">
                                                 <input
                                                     type="number"
                                                     value={h.score}
                                                     onChange={(e) => {
                                                         const val = parseInt(e.target.value) || 0;
                                                         setEditingHoles(prev => prev.map(hole => 
                                                             hole.holeNumber === h.holeNumber ? {...hole, score: val} : hole
                                                         ));
                                                     }}
                                                     className="w-10 text-center bg-white border-2 border-blue-300 rounded px-1 py-0.5 font-bold focus:ring-2 focus:ring-blue-500 outline-none"
                                                     min="1"
                                                     max="15"
                                                 />
                                             </td>
                                         ) : (
                                             <td key={h.holeNumber} className={`py-2 font-bold ${h.score < h.par ? 'text-red-500' : h.score > h.par ? 'text-blue-600' : ''}`}>
                                                 {h.score}
                                             </td>
                                         )
                                     ))}
                                 </tr>
                                 {isEditingScorecardDetail && (
                                     <tr>
                                         <td className="font-bold bg-gray-50 text-gray-600 py-2">Putts</td>
                                         {editingHoles.slice(9, 18).map(h => (
                                             <td key={h.holeNumber} className="py-2">
                                                 <input
                                                     type="number"
                                                     value={h.putts}
                                                     onChange={(e) => {
                                                         const val = parseInt(e.target.value) || 0;
                                                         setEditingHoles(prev => prev.map(hole => 
                                                             hole.holeNumber === h.holeNumber ? {...hole, putts: val} : hole
                                                         ));
                                                     }}
                                                     className="w-10 text-center bg-white border border-emerald-300 rounded px-1 py-0.5 focus:ring-2 focus:ring-emerald-500 outline-none"
                                                     min="0"
                                                     max="10"
                                                 />
                                             </td>
                                         ))}
                                     </tr>
                                 )}
                             </tbody>
                        </table>
                   </div>
                   
                   {/* Edit Mode Action Buttons */}
                   {isEditingScorecardDetail && (
                       <div className="p-4 border-t border-gray-200 bg-gray-50 flex gap-2">
                           <button
                               onClick={() => {
                                   setIsEditingScorecardDetail(false);
                                   // Reset to original data
                                   if (lesson.scorecardDetail) {
                                       setEditingCourseName(lesson.scorecardDetail.courseName);
                                       setEditingHoles(JSON.parse(JSON.stringify(lesson.scorecardDetail.holes)));
                                   }
                               }}
                               className="flex-1 py-2.5 rounded-lg bg-white border border-gray-300 text-gray-700 font-bold hover:bg-gray-50 transition-colors"
                           >
                               취소
                           </button>
                           <button
                               onClick={handleSaveScorecardEdit}
                               className="flex-1 py-2.5 rounded-lg bg-blue-600 text-white font-bold hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
                           >
                               <Save className="w-4 h-4" /> 저장하기
                           </button>
                       </div>
                   )}
                   
                   {/* Hole Details with AI Summary and Extracted Metrics */}
                   <div className="p-4 border-t border-gray-100">
                        <h4 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
                             <MessageCircle className="w-4 h-4 text-blue-500" /> 홀별 상세 기록 (음성 분석)
                        </h4>
                        <div className="space-y-3">
                            {lesson.scorecardDetail.holes.filter(h => h.aiSummary || h.voiceUrl).length === 0 ? (
                                <p className="text-xs text-gray-400 text-center py-2">상세 기록이 없습니다.</p>
                            ) : (
                                lesson.scorecardDetail.holes.filter(h => h.aiSummary || h.voiceUrl).map(h => (
                                    <div key={h.holeNumber} className="bg-gray-50 p-3 rounded-lg border border-gray-100">
                                        <div className="flex justify-between items-center mb-2">
                                            <span className="font-bold text-xs bg-gray-900 text-white px-2 py-0.5 rounded-full">{h.holeNumber}H</span>
                                            {h.voiceUrl && (
                                                <audio src={h.voiceUrl} controls className="h-6 w-32" />
                                            )}
                                        </div>
                                        {h.aiSummary && (
                                            <p className="text-xs text-gray-700 leading-relaxed bg-white p-2 rounded border border-gray-200 mb-2">
                                                {h.aiSummary}
                                            </p>
                                        )}
                                        {/* Extracted Shot Metrics Display */}
                                        {h.shotMetrics && (
                                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px] bg-white p-2 rounded border border-gray-200">
                                                {h.shotMetrics.teeDistance && (
                                                    <div className="text-gray-600">티샷: <span className="font-bold text-blue-600">{h.shotMetrics.teeDistance}m</span></div>
                                                )}
                                                {h.shotMetrics.secondShotDistance && (
                                                    <div className="text-gray-600">세컨: <span className="font-bold text-indigo-600">{h.shotMetrics.secondShotDistance}m</span></div>
                                                )}
                                                {h.shotMetrics.firstPuttDistance && (
                                                    <div className="text-gray-600">퍼팅: <span className="font-bold text-emerald-600">{h.shotMetrics.firstPuttDistance}m</span></div>
                                                )}
                                                {h.shotMetrics.approachDistance && (
                                                    <div className="text-gray-600">어프로치: <span className="font-bold text-orange-600">{h.shotMetrics.approachDistance}m</span></div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                ))
                            )}
                        </div>
                   </div>
              </div>
          )}

          {/* Round Analysis Card (Scorecard Mode - Fallback or General) */}
          {lesson.recordType === 'SCORE' && !lesson.scorecardDetail && (
              <div className="bg-white rounded-xl shadow-sm border border-blue-100 overflow-hidden">
                   <div className="bg-blue-600 px-4 py-3 flex justify-between items-center text-white">
                        <h3 className="font-bold flex items-center gap-2">
                            <Trophy className="w-5 h-5 text-yellow-300" /> Round Analysis
                        </h3>
                        {lesson.score && (
                            <span className="bg-white/20 px-3 py-1 rounded-full text-sm font-bold backdrop-blur-sm">
                                Total: {lesson.score}
                            </span>
                        )}
                   </div>
                   <div className="p-5">
                       {lesson.aiAnalysis ? (
                           <div className="prose prose-sm prose-blue text-gray-600 leading-relaxed">
                                <ReactMarkdown>{lesson.aiAnalysis}</ReactMarkdown>
                           </div>
                       ) : (
                           <div className="text-center py-6 text-gray-400 text-sm">
                               라운드 분석 내용이 없습니다.
                           </div>
                       )}
                   </div>
              </div>
          )}
          
          {/* General AI Analysis Card (Detailed Scorecard Mode) */}
          {lesson.scorecardDetail && lesson.aiAnalysis && (
              <div className="bg-white rounded-xl shadow-sm border border-blue-100 overflow-hidden">
                   <div className="bg-blue-50 px-4 py-3 border-b border-blue-100 flex items-center gap-2">
                        <Sparkles className="w-5 h-5 text-blue-500" /> 
                        <h3 className="font-bold text-blue-800">AI Round Summary</h3>
                   </div>
                   <div className="p-5 prose prose-sm prose-blue text-gray-600 leading-relaxed max-w-none">
                        <ReactMarkdown>{lesson.aiAnalysis}</ReactMarkdown>
                   </div>
              </div>
          )}

          {/* AI Analysis Card (Lesson/Practice Mode) */}
          {showAiAnalysis && lesson.recordType !== 'SCORE' && (
            <div className="bg-white rounded-xl shadow-sm border border-emerald-100 overflow-hidden">
                <div className="bg-emerald-50 px-4 py-3 border-b border-emerald-100 flex justify-between items-center">
                    <h3 className="font-bold text-emerald-800 flex items-center gap-2">
                        <Sparkles className="w-5 h-5 text-emerald-500" /> 
                        AI Coach Note
                    </h3>
                    <div className="flex gap-2">
                        {/* Audio Synthesis Controls */}
                        {lesson.aiAnalysis && (
                            <>
                                <button 
                                    onClick={isSpeaking ? handleStopSpeak : handleSpeakAnalysis}
                                    className={`p-1.5 rounded-full transition-colors ${isSpeaking ? 'bg-emerald-200 text-emerald-700 animate-pulse' : 'hover:bg-emerald-200 text-emerald-600'}`}
                                    title={isSpeaking ? "읽기 중지" : "분석 내용 듣기"}
                                >
                                    {isSpeaking ? <StopCircle className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                                </button>
                                <button 
                                    onClick={handleCopyAnalysis}
                                    className="p-1.5 hover:bg-emerald-200 rounded-full text-emerald-600 transition-colors"
                                    title="내용 복사"
                                >
                                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                                </button>
                            </>
                        )}
                    </div>
                </div>
                <div className="p-5">
                    {lesson.aiAnalysis ? (
                        <div className="prose prose-sm prose-emerald text-gray-600 leading-relaxed max-w-none">
                             <ReactMarkdown>{lesson.aiAnalysis}</ReactMarkdown>
                        </div>
                    ) : (
                        <div className="text-center py-8">
                            <Sparkles className="w-12 h-12 text-gray-200 mx-auto mb-3" />
                            <p className="text-gray-500 text-sm mb-4">아직 AI 분석 결과가 없습니다.</p>
                            {canEdit && (
                                <Button 
                                    onClick={handleGenerateAIAnalysis} 
                                    isLoading={isGeneratingAnalysis}
                                    className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-200"
                                    icon={<Wand2 className="w-4 h-4" />}
                                >
                                    AI 분석 생성하기
                                </Button>
                            )}
                        </div>
                    )}
                </div>
            </div>
          )}

          {/* Shot Data Visualizer (Only if Golf Data exists and NOT Score mode) */}
          {hasGolfData && lesson.recordType !== 'SCORE' && lesson.golfData && (
              <GolfDataVisualizer 
                  currentData={lesson.golfData}
                  allLessons={allLessons}
                  clientName={lesson.clientName}
                  clientPhone={lesson.clientPhone}
                  currentClub={lesson.club}
                  currentDate={lesson.date}
              />
          )}

          {/* Coach Notes */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
              <h3 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
                  <PenTool className="w-4 h-4 text-gray-500" /> 
                  {lesson.createdBy === 'COACH' ? '코치 메모' : '나의 메모'}
              </h3>
              <p className="text-gray-600 text-sm whitespace-pre-wrap leading-relaxed">
                  {lesson.coachNotes || (
                      <span className="text-gray-400 italic">메모 내용이 없습니다.</span>
                  )}
              </p>
          </div>

          {/* Client Feedback Section */}
          <div className={`bg-white rounded-xl shadow-sm border p-5 ${lesson.feedbackStatus === 'COMPLETED' ? 'border-emerald-200 bg-emerald-50/30' : 'border-gray-100'}`}>
              <div className="flex justify-between items-start mb-4">
                  <h3 className="font-bold text-gray-900 flex items-center gap-2">
                      <MessageCircle className="w-4 h-4 text-orange-500" />
                      회원 피드백 & 질문
                  </h3>
                  {lesson.feedbackStatus === 'COMPLETED' && (
                      <span className="text-[10px] font-bold text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded-full flex items-center gap-1">
                          <CheckCircle className="w-3 h-3" /> 작성 완료
                      </span>
                  )}
              </div>

              {isClientView ? (
                  // Client Edit Mode
                  <div className="space-y-3">
                      <textarea
                          value={clientNoteText}
                          onChange={(e) => setClientNoteText(e.target.value)}
                          placeholder="레슨 후 궁금한 점이나 느낀 점을 코치님께 남겨보세요."
                          rows={3}
                          className="w-full p-3 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none resize-none"
                      />
                      
                      {/* Voice Feedback Recorder */}
                      <div className="flex items-center gap-2">
                          {isClientRecording ? (
                              <button 
                                onClick={stopRecording}
                                className="flex-1 bg-red-500 text-white py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-2 animate-pulse"
                              >
                                  <StopCircle className="w-4 h-4" /> 녹음 중지 ({Math.floor(recordingTime/60)}:{String(recordingTime%60).padStart(2,'0')})
                              </button>
                          ) : (
                              <button 
                                onClick={() => startRecordingAudio(true)}
                                className="flex-1 bg-gray-100 text-gray-600 hover:bg-gray-200 py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-colors"
                              >
                                  <Mic className="w-4 h-4" /> 음성 질문 녹음
                              </button>
                          )}
                      </div>

                      {clientVoicePreviewUrl && (
                          <div className="bg-gray-50 p-2 rounded-lg flex items-center gap-2">
                              <Mic className="w-4 h-4 text-emerald-600" />
                              <audio src={clientVoicePreviewUrl} controls className="h-8 w-full" />
                              <button onClick={() => setClientVoicePreviewUrl(null)} className="text-gray-400 hover:text-red-500">
                                  <X className="w-4 h-4" />
                              </button>
                          </div>
                      )}

                      <div className="flex justify-end pt-2">
                          <Button onClick={saveClientFeedback} className="bg-emerald-600 text-white px-4 py-2 text-sm">
                              피드백 저장
                          </Button>
                      </div>
                  </div>
              ) : (
                  // Coach View Mode
                  <div className="space-y-3">
                      {lesson.clientFeedback ? (
                          <>
                              {lesson.clientFeedback.text && (
                                  <p className="text-sm text-gray-700 bg-gray-50 p-3 rounded-lg border border-gray-100">
                                      "{lesson.clientFeedback.text}"
                                  </p>
                              )}
                              {lesson.clientFeedback.voiceUrl && (
                                  <div className="bg-gray-50 p-3 rounded-lg border border-gray-100">
                                      <p className="text-xs text-gray-500 mb-2 flex items-center gap-1"><Mic className="w-3 h-3" /> 음성 질문</p>
                                      <audio src={lesson.clientFeedback.voiceUrl} controls className="w-full h-8" />
                                  </div>
                              )}
                              <p className="text-xs text-gray-400 text-right">
                                  작성일: {new Date(lesson.clientFeedback.updatedAt).toLocaleDateString()}
                              </p>
                          </>
                      ) : (
                          <div className="text-center py-4 text-gray-400 text-sm bg-gray-50 rounded-lg border border-dashed border-gray-200">
                              아직 작성된 피드백이 없습니다.
                              <div className="mt-2">
                                  <button onClick={handleRequestFeedback} className="text-emerald-600 text-xs font-bold hover:underline">
                                      피드백 요청 보내기
                                  </button>
                              </div>
                          </div>
                      )}
                  </div>
              )}
          </div>

          {/* Bottom Back & Delete Buttons */}
          <div className="pt-4 flex flex-col gap-2">
              <Button 
                onClick={onBack} 
                variant="secondary" 
                className="w-full py-3 text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 shadow-sm"
              >
                  <ArrowLeft className="w-4 h-4 mr-2" /> 목록으로 돌아가기
              </Button>
              
              {/* Edit Button */}
              {onEdit && canEditOrDelete && (
                  <button 
                    onClick={() => onEdit(lesson)}
                    className="w-full py-3 text-emerald-600 bg-emerald-50 rounded-lg text-sm font-bold hover:bg-emerald-100 transition-colors flex items-center justify-center gap-2"
                  >
                      <Edit2 className="w-4 h-4" /> 레슨 기록 수정하기
                  </button>
              )}
              
              {/* Delete Button */}
              {onDelete && canEditOrDelete && (
                  <button 
                    onClick={handleDeleteLesson}
                    className="w-full py-3 text-red-500 bg-red-50 rounded-lg text-sm font-bold hover:bg-red-100 transition-colors flex items-center justify-center gap-2"
                  >
                      <Trash2 className="w-4 h-4" /> 레슨 기록 삭제하기
                  </button>
              )}

              {/* KakaoTalk Share Button (Coach only) */}
              {!isClientView && (
                  <button
                      onClick={handleKakaoShare}
                      disabled={kakaoShareStatus === 'loading'}
                      className="w-full py-3 rounded-lg text-sm font-bold transition-colors flex items-center justify-center gap-2 bg-[#FEE500] text-[#3C1E1E] hover:bg-[#F5D800] disabled:opacity-60"
                      data-testid="kakao-share-button"
                  >
                      <Send className="w-4 h-4" />
                      {kakaoShareStatus === 'loading' ? '카카오톡 열기…' : '카카오톡으로 공유하기'}
                  </button>
              )}

              {/* KakaoTalk Share Error/Info Messages */}
              {kakaoShareStatus === 'no_key' && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 space-y-2">
                      <p className="text-center text-xs text-amber-700">
                          카카오톡 공유 기능이 설정되지 않았습니다. 링크를 복사하여 직접 전달하세요.
                      </p>
                      <button
                          onClick={handleCopyLink}
                          data-testid="copy-link-button"
                          className="w-full py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-2 bg-white border border-amber-300 text-amber-700 hover:bg-amber-100 transition-colors"
                      >
                          {linkCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                          {linkCopied ? '링크 복사됨!' : '레슨 링크 복사하기'}
                      </button>
                  </div>
              )}
              {kakaoShareStatus === 'error' && (
                  <p className="text-center text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">
                      카카오톡 공유 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.
                  </p>
              )}
          </div>
          
          <div className="text-center text-xs text-gray-400 pt-4 pb-8">
              Lesson ID: {lesson.id} • {new Date(lesson.createdAt).toLocaleString()}
          </div>
        </div>
      </div>

      {/* Temp Notification Toast */}
      {tempNotification && (
          <div className="fixed top-20 left-1/2 transform -translate-x-1/2 bg-black/80 text-white px-4 py-2 rounded-full text-sm font-bold shadow-lg animate-fade-in-up z-[60] flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-400" />
              {tempNotification}
          </div>
      )}

      {/* Add Media Modal */}
      {isAddingMedia && (
        <div className="fixed inset-0 z-[70] bg-black/90 flex flex-col animate-fade-in">
             <div className="flex justify-end p-4">
                 <button onClick={closeAddModal} className="text-white p-2 rounded-full hover:bg-white/10">
                     <X className="w-8 h-8" />
                 </button>
             </div>
             {/* ... (Add Media Content) ... */}
             <div className="flex-1 flex flex-col items-center justify-center p-4">
                 {addMode === 'SELECT' && (
                     <div className="grid grid-cols-3 gap-6 w-full max-w-md">
                         <button onClick={startCamera} className="aspect-square bg-gray-800 rounded-2xl flex flex-col items-center justify-center gap-3 text-white hover:bg-gray-700 transition-colors">
                             <Camera className="w-10 h-10 text-emerald-400" />
                             <span className="font-bold">카메라 촬영</span>
                         </button>
                         <button onClick={() => fileInputRef.current?.click()} className="aspect-square bg-gray-800 rounded-2xl flex flex-col items-center justify-center gap-3 text-white hover:bg-gray-700 transition-colors">
                             <ImageIcon className="w-10 h-10 text-blue-400" />
                             <span className="font-bold">앨범에서 선택</span>
                         </button>
                         <button onClick={() => startRecordingAudio()} className="aspect-square bg-gray-800 rounded-2xl flex flex-col items-center justify-center gap-3 text-white hover:bg-gray-700 transition-colors">
                             <Mic className="w-10 h-10 text-purple-400" />
                             <span className="font-bold">음성 녹음</span>
                         </button>
                         <input 
                            type="file" 
                            ref={fileInputRef} 
                            className="hidden" 
                            accept="video/*,image/*,audio/*" 
                            multiple
                            onChange={handleFileUpload}
                         />
                     </div>
                 )}

                 {addMode === 'CAMERA' && (
                     <div className="w-full max-w-md relative bg-black rounded-2xl overflow-hidden aspect-[9/16]">
                         <video ref={videoPreviewRef} autoPlay muted playsInline className="w-full h-full object-cover" />
                         
                         <div className="absolute bottom-8 left-0 right-0 flex justify-center items-center gap-8">
                             {!isRecording ? (
                                 <>
                                     <button onClick={takePhoto} className="w-16 h-16 bg-white rounded-full border-4 border-gray-300 flex items-center justify-center shadow-lg hover:bg-gray-100">
                                         <Camera className="w-8 h-8 text-gray-800" />
                                     </button>
                                     <button onClick={startRecordingVideo} className="w-20 h-20 bg-red-600 rounded-full border-4 border-white shadow-lg hover:scale-105 transition-transform" />
                                 </>
                             ) : (
                                 <button onClick={stopRecording} className="w-20 h-20 bg-white rounded-full flex items-center justify-center shadow-lg border-4 border-gray-300">
                                     <div className="w-8 h-8 bg-red-600 rounded-sm" />
                                 </button>
                             )}
                         </div>
                         {isRecording && (
                             <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-red-600 px-3 py-1 rounded-full text-white font-bold text-sm animate-pulse">
                                 {Math.floor(recordingTime/60)}:{String(recordingTime%60).padStart(2,'0')}
                             </div>
                         )}
                     </div>
                 )}

                 {addMode === 'VOICE' && (
                     <div className="text-center text-white">
                         <div className={`w-32 h-32 rounded-full flex items-center justify-center mx-auto mb-8 transition-all ${isRecording ? 'bg-red-500 animate-pulse' : 'bg-gray-700'}`}>
                             <Mic className="w-16 h-16 text-white" />
                         </div>
                         <div className="text-4xl font-bold font-mono mb-8">
                             {Math.floor(recordingTime/60)}:{String(recordingTime%60).padStart(2,'0')}
                         </div>
                         <Button onClick={stopRecording} className="bg-white text-red-600 hover:bg-gray-100 font-bold px-8 py-4 rounded-full text-lg">
                             녹음 중지
                         </Button>
                     </div>
                 )}

                 {addMode === 'PREVIEW' && capturedMedia && (
                     <div className="w-full max-w-md space-y-4">
                         <div className="bg-black rounded-xl overflow-hidden shadow-lg border border-gray-800 relative aspect-video flex items-center justify-center">
                             {capturedMedia.type === 'video' ? (
                                 <video src={capturedMedia.url} controls className="max-w-full max-h-full" />
                             ) : capturedMedia.type === 'image' ? (
                                 <img src={capturedMedia.url} className="max-w-full max-h-full object-contain" alt="preview" />
                             ) : (
                                 <audio src={capturedMedia.url} controls className="w-full px-4" />
                             )}
                         </div>
                         <div className="flex gap-3">
                             <Button onClick={closeAddModal} variant="secondary" className="flex-1 bg-gray-800 text-white border-gray-700 hover:bg-gray-700">다시하기</Button>
                             <Button onClick={saveAdditionalMedia} className="flex-[2] bg-emerald-600 hover:bg-emerald-700 text-white">저장하기</Button>
                         </div>
                     </div>
                 )}
             </div>
        </div>
      )}

      {/* Video Editor Modal */}
      {showVideoEditor && (
          <VideoEditor
              videoUrl={lesson.editedVideoUrl || lesson.videoUrl}
              onSave={handleSaveEditedVideo}
              onCancel={() => setShowVideoEditor(false)}
              lessonId={lesson.id}
          />
      )}

      {/* Sequence Image Viewer Modal */}
      {selectedSequenceImage && (
          <div className="fixed inset-0 z-[80] bg-black/95 flex flex-col animate-fade-in" onClick={handleCompleteSequence}>
              <button 
                onClick={handleCompleteSequence}
                className="absolute top-4 right-4 text-white/90 hover:text-white p-4" // Increased padding for easier touch
              >
                  <X className="w-10 h-10" />
              </button>
              <div className="flex-1 flex items-center justify-center p-4">
                  <img src={selectedSequenceImage} className="max-w-full max-h-full object-contain rounded-lg shadow-2xl" alt="Sequence Detail" />
              </div>
          </div>
      )}
    </div>
  );
};
