
import React, { useState, useRef, useEffect } from 'react';
import { useLanguage } from './LanguageContext';
import { Lesson, MediaItem, SwingSequenceItem, HoleRecord, ScorecardDetail, VideoEditMetadata, CompareVideoMetadata } from '../types';
import { Button } from './Button';
import { ArrowLeft, Calendar, User, Sparkles, Mic, Plus, Video, Image as ImageIcon, X, Camera, Square, Trash2, Mic2, PlayCircle, Lock, PenTool, Save, Target, AlertTriangle, MessageCircle, CheckCircle, AlertCircle, Clock, Volume2, StopCircle, Copy, Check, Film, ChevronRight, FileText, MonitorPlay, Scissors, GripHorizontal, RefreshCw, Maximize2, Zap, Play, Pause, ListChecks, Trophy, Wand2, MapPin, Edit2, TrendingUp, Send, Download, Loader2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { analyzeSwingVideo } from '../services/geminiService';
import { SwingGuideOverlay } from './SwingGuideOverlay';
import { GolfDataVisualizer } from './GolfDataVisualizer';
import { VideoEditor } from './VideoEditor';
import { firebaseService } from '../services/firebase';
import { apiService, resolveMediaUrl } from '../services/apiService';
import { storageService } from '../services/storage';
import { sendLessonNoteViaKakao, buildLessonShareUrl } from '../services/kakaoShareService';
import { videoEditingService } from '../services/videoEditingService';
import { videoStore, IDB_PREFIX } from '../services/videoStore';

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
  const { t } = useLanguage();
  const [activeMedia, setActiveMedia] = useState<MediaItem>({
    id: 'main',
    url: lesson.videoUrl,
    type: lesson.mediaType,
    createdAt: lesson.createdAt
  });
  
  const [isAddingMedia, setIsAddingMedia] = useState(false);
  const [addMode, setAddMode] = useState<'SELECT' | 'CAMERA' | 'VOICE' | 'SCREEN' | 'PREVIEW'>('SELECT');
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

  // Compare Video State
  const [isGeneratingCompare, setIsGeneratingCompare] = useState(false);
  const [compareProgress, setCompareProgress] = useState(0);
  const [pendingRole, setPendingRole] = useState<'BEFORE' | 'AFTER' | undefined>(undefined);

  // KakaoTalk Share State
  const [kakaoShareStatus, setKakaoShareStatus] = useState<'idle' | 'loading' | 'no_key' | 'error'>('idle');
  const [linkCopied, setLinkCopied] = useState(false);

  // Edited video actions state
  const [isDownloadingEditedVideo, setIsDownloadingEditedVideo] = useState(false);

  // Resolved blob URLs for locally-stored (idb://) videos
  const [resolvedEditedUrl, setResolvedEditedUrl] = useState<string | null>(null);
  const [resolvedCompareUrl, setResolvedCompareUrl] = useState<string | null>(null);


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
  // Always show AI lesson summary if it exists
  const showAiAnalysis = true; 
  const hasGolfData = !!lesson.golfData;
  const getHoleVoiceUrls = (hole: HoleRecord): string[] => {
    if (hole.voiceUrls && hole.voiceUrls.length > 0) return hole.voiceUrls;
    return hole.voiceUrl ? [hole.voiceUrl] : [];
  };

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
    if ((addMode === 'CAMERA' || addMode === 'SCREEN') && videoPreviewRef.current && streamRef.current) {
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
          alert(t('lesson_ai_failed'));
      } finally {
          setIsGeneratingAnalysis(false);
      }
  };

  const handleOpenVideoEditor = () => {
    if (lesson.mediaType !== 'video') {
      alert(t('lesson_video_only'));
      return;
    }
    setShowVideoEditor(true);
  };

  const handleSaveEditedVideo = async (editedBlob: Blob, metadata: VideoEditMetadata) => {
    try {
      let editedUrl: string;
      const userId = lesson.coachId || 'unknown';

      if (apiService.isAvailable()) {
        editedUrl = await apiService.uploadEditedVideo(editedBlob, lesson.id, userId);
      } else if (firebaseService.isInitialized()) {
        editedUrl = await firebaseService.uploadEditedVideo(editedBlob, lesson.id, userId);
      } else {
        // Persist to IndexedDB so the URL survives page refresh
        editedUrl = await videoStore.save(`edited_${lesson.id}`, editedBlob);
        // Immediately resolve for use in this session
        const freshUrl = URL.createObjectURL(editedBlob);
        setResolvedEditedUrl(freshUrl);
      }

      const updatedLesson: Lesson = {
        ...lesson,
        editedVideoUrl: editedUrl,
        videoEditMetadata: metadata,
      };

      onUpdate(updatedLesson);
      setShowVideoEditor(false);
      alert(t('lesson_edit_saved'));
    } catch (error) {
      console.error('Error saving edited video:', error);
      alert(t('lesson_edit_save_error'));
    }
  };

  const handleGenerateCompareVideo = async () => {
    const beforeItem = lesson.additionalMedia?.find(m => m.type === 'video' && m.role === 'BEFORE');
    const afterItem = lesson.additionalMedia?.find(m => m.type === 'video' && m.role === 'AFTER');

    if (!beforeItem || !afterItem) {
      alert(t('lesson_compare_need_both'));
      return;
    }

    setIsGeneratingCompare(true);
    setCompareProgress(0);

    try {
      const [beforeBlob, afterBlob] = await Promise.all([
        fetch(resolveMediaUrl(beforeItem.url)).then(r => r.blob()),
        fetch(resolveMediaUrl(afterItem.url)).then(r => r.blob()),
      ]);

      const compareBlob = await videoEditingService.createSideBySideCompareVideo(
        beforeBlob,
        afterBlob,
        { watermarkText: 'CoachXai' },
        (progress) => setCompareProgress(Math.round(progress * 100))
      );

      let compareUrl: string;
      const userId = lesson.coachId || 'unknown';
      if (apiService.isAvailable()) {
        compareUrl = await apiService.uploadCompareVideo(compareBlob, lesson.id, userId);
      } else if (firebaseService.isInitialized()) {
        compareUrl = await firebaseService.uploadCompareVideo(compareBlob, lesson.id, userId);
      } else {
        // Persist to IndexedDB so the URL survives page refresh
        compareUrl = await videoStore.save(`compare_${lesson.id}`, compareBlob);
        const freshUrl = URL.createObjectURL(compareBlob);
        setResolvedCompareUrl(freshUrl);
      }

      const metadata: CompareVideoMetadata = {
        beforeMediaId: beforeItem.id,
        afterMediaId: afterItem.id,
        watermarkText: 'CoachXai',
        createdAt: new Date().toISOString(),
      };

      onUpdate({ ...lesson, compareVideoUrl: compareUrl, compareVideoMetadata: metadata });
      showTempNotification(t('lesson_compare_saved'));
    } catch (error) {
      console.error('Error generating compare video:', error);
      alert(t('lesson_compare_save_error'));
    } finally {
      setIsGeneratingCompare(false);
      setCompareProgress(0);
    }
  };

  const handleToggleMediaRole = (mediaId: string, currentRole?: 'BEFORE' | 'AFTER') => {
    const nextRole: 'BEFORE' | 'AFTER' | undefined =
      currentRole === undefined ? 'BEFORE' : currentRole === 'BEFORE' ? 'AFTER' : undefined;

    const updatedMedia = (lesson.additionalMedia || []).map(m =>
      m.id === mediaId ? { ...m, role: nextRole } : m
    );
    onUpdate({ ...lesson, additionalMedia: updatedMedia });
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
          alert(t('lesson_video_not_playing'));
          return;
      }

      if (video.readyState < 2 || video.videoWidth === 0) {
          alert(t('lesson_video_not_loaded'));
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
              showTempNotification(t('lesson_capture_done').replace('{label}', label));
          } catch (e) {
              console.error(e);
              alert(t('lesson_capture_failed'));
          }
      }
  };

  const handleRemoveSequenceItem = (id: string) => {
      if (!confirm(t('lesson_delete_media_confirm'))) return;
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
      alert(t('lesson_camera_permission'));
    }
  };

  const startScreenCapture = async () => {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      alert(t('lesson_screen_record_unsupported'));
      return;
    }
    try {
      stopMediaStream();
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      streamRef.current = stream;
      setAddMode('SCREEN');
    } catch (err: any) {
      if (err.name === 'NotAllowedError') {
        alert(t('lesson_screen_capture_denied'));
      } else if (err.name !== 'AbortError') {
        console.error(err);
      }
    }
  };

  const startRecordingScreen = () => {
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
    timerRef.current = window.setInterval(() => setRecordingTime(p => p + 1), 1000);

    // Handle user stopping screen share via the browser's native "Stop sharing" button
    const videoTrack = streamRef.current.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.onended = () => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
          mediaRecorderRef.current.stop();
        }
      };
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
        alert(t('lesson_mic_permission'));
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
          alert(t('lesson_media_added').replace('{count}', String(newItems.length)));
      }
      
      e.target.value = '';
  };

  const saveAdditionalMedia = () => {
      if (!capturedMedia) return;
      
      const newItem: MediaItem = {
          id: crypto.randomUUID(),
          url: capturedMedia.url,
          type: capturedMedia.type,
          role: capturedMedia.type === 'video' ? pendingRole : undefined,
          createdAt: Date.now()
      };

      const updatedLesson: Lesson = {
          ...lesson,
          additionalMedia: [...(lesson.additionalMedia || []), newItem]
      };
      
      onUpdate(updatedLesson);
      setPendingRole(undefined);
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
      if (confirm(t('lesson_feedback_request_confirm'))) {
          onUpdate({ ...lesson, feedbackStatus: 'REQUESTED' });
          showTempNotification(t('lesson_feedback_request_sent'));
      }
  };

  const handleSaveScorecardEdit = () => {
      if (!editingCourseName.trim()) {
          alert(t('lesson_course_name_required'));
          return;
      }

      // Validate scores
      const hasInvalidScore = editingHoles.some(h => h.score <= 0 || h.par <= 0);
      if (hasInvalidScore) {
          alert(t('lesson_scorecard_invalid'));
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
      showTempNotification(t('lesson_scorecard_updated'));
  };

  const closeAddModal = () => {
      setIsAddingMedia(false);
      setAddMode('SELECT');
      setCapturedMedia(null);
      setPendingRole(undefined);
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

  const handleDownloadEditedVideo = async () => {
    if (!lesson.editedVideoUrl) return;
    setIsDownloadingEditedVideo(true);
    try {
      // For idb:// URLs, use the already-resolved blob URL if available
      const fetchUrl = resolvedEditedUrl || resolveMediaUrl(lesson.editedVideoUrl!);
      if (!fetchUrl || fetchUrl.startsWith(IDB_PREFIX)) {
        alert('영상을 불러올 수 없습니다. 앱을 다시 열고 시도해 주세요.');
        return;
      }
      const response = await fetch(fetchUrl);
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = `edited_${lesson.clientName}_${lesson.date}.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(objectUrl);
    } catch {
      alert('다운로드에 실패했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setIsDownloadingEditedVideo(false);
    }
  };

  useEffect(() => {
      if (isAddingMedia || isCommentaryMode || isSequenceMode || selectedSequenceImage) {
          document.body.style.overflow = 'hidden';
      } else {
          document.body.style.overflow = 'unset';
      }
  }, [isAddingMedia, isCommentaryMode, isSequenceMode, selectedSequenceImage]);

  // Resolve idb:// URLs to fresh blob URLs whenever the lesson changes
  useEffect(() => {
    let editedObjUrl: string | null = null;
    let compareObjUrl: string | null = null;

    const resolve = async () => {
      if (lesson.editedVideoUrl?.startsWith(IDB_PREFIX)) {
        editedObjUrl = await videoStore.resolve(lesson.editedVideoUrl);
        setResolvedEditedUrl(editedObjUrl);
      } else {
        setResolvedEditedUrl(null);
      }

      if (lesson.compareVideoUrl?.startsWith(IDB_PREFIX)) {
        compareObjUrl = await videoStore.resolve(lesson.compareVideoUrl);
        setResolvedCompareUrl(compareObjUrl);
      } else {
        setResolvedCompareUrl(null);
      }
    };

    resolve();

    return () => {
      if (editedObjUrl) URL.revokeObjectURL(editedObjUrl);
      if (compareObjUrl) URL.revokeObjectURL(compareObjUrl);
    };
  }, [lesson.editedVideoUrl, lesson.compareVideoUrl]);

  const recordTypeLabel =
    lesson.recordType === 'SCORE'
      ? '라운드 기록'
      : lesson.recordType === 'PRACTICE'
      ? '연습 기록'
      : '레슨 기록';

  return (
    <div className="fixed inset-0 z-50 bg-slate-50 flex flex-col h-full overflow-hidden animate-fade-in">
      {/* ... (Header and Main Content rendering remains same) ... */}
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 px-4 py-3 flex items-center justify-between text-white flex-shrink-0 safe-area-top relative shadow-lg">
        <button
          onClick={onBack}
          className="p-3 bg-white/10 backdrop-blur-sm rounded-full hover:bg-white/20 text-white transition-all duration-200 hover:scale-110 transform min-w-[44px] min-h-[44px] flex items-center justify-center"
          aria-label="목록으로 돌아가기"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h2 className="text-lg font-bold truncate max-w-[200px] text-center">{lesson.title}</h2>
        <div className="w-11 flex justify-end">
            {canEdit && onEdit && (
                <button
                    onClick={() => onEdit(lesson)}
                    className="p-3 bg-white/10 backdrop-blur-sm rounded-full hover:bg-white/20 text-white transition-all duration-200 hover:scale-110 transform min-w-[44px] min-h-[44px] flex items-center justify-center"
                    title="기록 수정"
                >
                    <Edit2 className="w-5 h-5" />
                </button>
            )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto bg-gray-50 custom-scrollbar safe-area-bottom">
        <div className="max-w-4xl mx-auto p-4 space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-sm">
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-600">
              <span className="inline-flex items-center gap-1 bg-indigo-50 text-indigo-700 px-2.5 py-1 rounded-full">
                <FileText className="w-3.5 h-3.5" aria-hidden="true" /> {recordTypeLabel}
              </span>
              <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-700 px-2.5 py-1 rounded-full">
                <User className="w-3.5 h-3.5" aria-hidden="true" /> {lesson.clientName}
              </span>
              <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-700 px-2.5 py-1 rounded-full">
                <Calendar className="w-3.5 h-3.5" aria-hidden="true" /> {lesson.date}
              </span>
            </div>
          </div>

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
                                src={resolveMediaUrl(activeMedia.url)}
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
                            <img src={resolveMediaUrl(activeMedia.url)} className="w-full h-full object-contain" alt="Lesson Media" />
                        ) : (
                            <div className="text-center p-8">
                                <div className="w-20 h-20 bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse">
                                    <Mic className="w-10 h-10 text-emerald-400" />
                                </div>
                                <h3 className="text-white font-bold mb-2">음성 녹음</h3>
                                <audio src={resolveMediaUrl(activeMedia.url)} controls className="mt-4" />
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
                                        className="absolute top-0 left-0 h-full bg-gradient-to-r from-emerald-700 to-emerald-400 rounded-full shadow-lg shadow-emerald-700/50" 
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
                    {activeMedia.role && (
                      <div className={`absolute top-3 right-3 px-2 py-1 rounded-lg text-xs font-bold text-white z-20 ${
                        activeMedia.role === 'BEFORE' ? 'bg-blue-600/80 backdrop-blur-md' : 'bg-orange-500/80 backdrop-blur-md'
                      }`}>
                        {activeMedia.role === 'BEFORE' ? '레슨 전 영상' : '레슨 후 영상'}
                      </div>
                    )}
              </div>

              {/* Media Thumbnails */}
              <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide px-1">
                  <button
                    onClick={() => setActiveMedia({ id: 'main', url: lesson.videoUrl, type: lesson.mediaType, createdAt: lesson.createdAt })}
                    className={`relative w-16 h-16 flex-shrink-0 rounded-lg overflow-hidden border-2 transition-all ${activeMedia.id === 'main' ? 'border-emerald-700 ring-2 ring-emerald-200' : 'border-transparent opacity-70 hover:opacity-100'}`}
                  >
                      {lesson.mediaType === 'video' ? <video src={lesson.videoUrl} className="w-full h-full object-cover" /> :
                       lesson.mediaType === 'image' ? <img src={lesson.videoUrl} className="w-full h-full object-cover" alt="thumb" /> :
                       <div className="w-full h-full bg-gray-800 flex items-center justify-center"><Mic className="w-6 h-6 text-white" /></div>}
                  </button>

                  {/* Edited Video Thumbnail */}
                  {lesson.editedVideoUrl && (
                      <button
                        onClick={() => {
                          const url = resolvedEditedUrl || (lesson.editedVideoUrl!.startsWith(IDB_PREFIX) ? null : resolveMediaUrl(lesson.editedVideoUrl!));
                          if (url) setActiveMedia({ id: 'edited', url, type: 'video', createdAt: lesson.createdAt });
                        }}
                        className={`relative w-16 h-16 flex-shrink-0 rounded-lg overflow-hidden border-2 transition-all ${activeMedia.id === 'edited' ? 'border-blue-600 ring-2 ring-blue-200' : 'border-transparent opacity-70 hover:opacity-100'}`}
                      >
                          {(resolvedEditedUrl || !lesson.editedVideoUrl.startsWith(IDB_PREFIX)) && (
                            <video src={resolvedEditedUrl || resolveMediaUrl(lesson.editedVideoUrl!)} className="w-full h-full object-cover" />
                          )}
                          <div className="absolute bottom-0 left-0 right-0 bg-blue-600/90 text-white text-[9px] font-bold text-center py-0.5">
                              편집본
                          </div>
                      </button>
                  )}

                  {lesson.additionalMedia?.map(media => (
                      <div key={media.id} className="relative group flex-shrink-0">
                          <button 
                            onClick={() => setActiveMedia(media)}
                            className={`w-16 h-16 rounded-lg overflow-hidden border-2 transition-all ${activeMedia.id === media.id ? 'border-emerald-700 ring-2 ring-emerald-200' : 'border-transparent opacity-70 hover:opacity-100'}`}
                          >
                            {media.type === 'video' ? <video src={resolveMediaUrl(media.url)} className="w-full h-full object-cover" /> : 
                             media.type === 'image' ? <img src={resolveMediaUrl(media.url)} className="w-full h-full object-cover" alt="thumb" /> :
                             <div className="w-full h-full bg-gray-800 flex items-center justify-center"><Mic className="w-6 h-6 text-white" /></div>}
                          </button>
                          {/* Role badge for video items */}
                          {media.type === 'video' && (
                            <button
                              onClick={(e) => { e.stopPropagation(); if (canEdit) handleToggleMediaRole(media.id, media.role); }}
                              className={`absolute bottom-0 left-0 right-0 text-[9px] font-bold py-0.5 text-center transition-colors ${
                                media.role === 'BEFORE' ? 'bg-blue-600 text-white' :
                                media.role === 'AFTER'  ? 'bg-emerald-600 text-white' :
                                'bg-black/50 text-gray-300'
                              }`}
                              title={canEdit ? t('lesson_compare_role_none') : undefined}
                            >
                              {media.role === 'BEFORE' ? t('lesson_compare_role_before') :
                               media.role === 'AFTER'  ? t('lesson_compare_role_after') : '—'}
                            </button>
                          )}
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
                        className="w-16 h-16 flex-shrink-0 rounded-lg border-2 border-dashed border-gray-300 flex flex-col items-center justify-center text-gray-400 hover:text-emerald-700 hover:border-emerald-300 hover:bg-emerald-50 transition-all gap-1"
                      >
                          <Plus className="w-5 h-5" />
                          <span className="text-[10px] font-bold">추가</span>
                      </button>
                  )}
              </div>

               {/* Edited Video Actions: Download */}
               {activeMedia.id === 'edited' && lesson.editedVideoUrl && (
                 <div className="pt-2">
                   <button
                     onClick={handleDownloadEditedVideo}
                     disabled={isDownloadingEditedVideo}
                     className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold transition-colors disabled:opacity-50"
                   >
                     {isDownloadingEditedVideo
                       ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                       : <Download className="w-3.5 h-3.5" />}
                     기기에 저장
                   </button>
                 </div>
               )}

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

               {/* Before/After Compare Video Button */}
               {(() => {
                 const beforeItem = lesson.additionalMedia?.find(m => m.type === 'video' && m.role === 'BEFORE');
                 const afterItem  = lesson.additionalMedia?.find(m => m.type === 'video' && m.role === 'AFTER');
                 const hasCompareVideos = !!(beforeItem && afterItem);
                 return hasCompareVideos && canEdit ? (
                   <div className="space-y-2 pt-2">
                     <div className="flex justify-center">
                       <Button
                         onClick={handleGenerateCompareVideo}
                         disabled={isGeneratingCompare}
                         className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-60 text-sm"
                       >
                         <Film className="w-4 h-4" />
                         {isGeneratingCompare ? t('lesson_compare_generating') : t('lesson_compare_btn')}
                       </Button>
                     </div>
                     {isGeneratingCompare && (
                       <div className="px-4">
                         <div className="w-full bg-gray-200 rounded-full h-2">
                           <div
                             className="bg-purple-600 h-2 rounded-full transition-all duration-300"
                             style={{ width: `${compareProgress}%` }}
                           />
                         </div>
                         <p className="text-center text-xs text-gray-500 mt-1">{compareProgress}%</p>
                       </div>
                     )}
                   </div>
                 ) : null;
               })()}

               {/* Compare Video Preview */}
               {lesson.compareVideoUrl && (resolvedCompareUrl || !lesson.compareVideoUrl.startsWith(IDB_PREFIX)) && (
                 <div className="bg-white rounded-xl shadow-sm border border-purple-100 p-4 mt-2">
                   <div className="flex justify-between items-center mb-3">
                     <h3 className="font-bold text-gray-900 flex items-center gap-2 text-sm">
                       <Film className="w-4 h-4 text-purple-600" />
                       {t('lesson_compare_preview_title')}
                     </h3>
                     {canEdit && (
                       <Button
                         onClick={handleGenerateCompareVideo}
                         disabled={isGeneratingCompare}
                         className="flex items-center gap-1 bg-purple-100 hover:bg-purple-200 text-purple-700 text-xs py-1 px-2"
                         variant="secondary"
                       >
                         <RefreshCw className="w-3 h-3" />
                         {t('lesson_compare_regenerate')}
                       </Button>
                     )}
                   </div>
                   <div className="max-w-xs mx-auto aspect-[9/16] rounded-lg overflow-hidden bg-black">
                     <video
                       src={resolvedCompareUrl || resolveMediaUrl(lesson.compareVideoUrl)}
                       controls
                       playsInline
                       className="w-full h-full object-contain"
                     />
                   </div>
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
                                                     className="w-10 text-center bg-white border border-emerald-300 rounded px-1 py-0.5 focus:ring-2 focus:ring-emerald-700 outline-none"
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
                                                     className="w-10 text-center bg-white border border-emerald-300 rounded px-1 py-0.5 focus:ring-2 focus:ring-emerald-700 outline-none"
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
                            {lesson.scorecardDetail.holes.filter(h => h.aiSummary || getHoleVoiceUrls(h).length > 0).length === 0 ? (
                                <p className="text-xs text-gray-400 text-center py-2">상세 기록이 없습니다.</p>
                            ) : (
                                lesson.scorecardDetail.holes.filter(h => h.aiSummary || getHoleVoiceUrls(h).length > 0).map(h => (
                                    <div key={h.holeNumber} className="bg-gray-50 p-3 rounded-lg border border-gray-100">
                                        <div className="flex justify-between items-center mb-2">
                                            <span className="font-bold text-xs bg-gray-900 text-white px-2 py-0.5 rounded-full">{h.holeNumber}H</span>
                                            {getHoleVoiceUrls(h).length > 0 && (
                                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                                                    음성 {getHoleVoiceUrls(h).length}개
                                                </span>
                                            )}
                                        </div>
                                        {getHoleVoiceUrls(h).length > 0 && (
                                            <div className="space-y-1 mb-2">
                                                {getHoleVoiceUrls(h).map((voiceUrl, index) => (
                                                    <audio key={`${h.holeNumber}-${index}`} src={voiceUrl} controls className="h-6 w-full" />
                                                ))}
                                            </div>
                                        )}
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

          {/* Round Summary Card (Scorecard Mode - Fallback or General) */}
          {lesson.recordType === 'SCORE' && !lesson.scorecardDetail && (
              <div className="bg-white rounded-xl shadow-sm border border-blue-100 overflow-hidden">
                   <div className="bg-blue-600 px-4 py-3 flex justify-between items-center text-white">
                         <h3 className="font-bold flex items-center gap-2">
                            <Trophy className="w-5 h-5 text-yellow-300" /> Round Summary
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
                                라운드 요약 내용이 없습니다.
                            </div>
                        )}
                    </div>
               </div>
          )}
          
          {/* Round Report Summary Card (Detailed Scorecard Mode) */}
          {lesson.scorecardDetail && lesson.aiAnalysis && (
              <div className="bg-white rounded-xl shadow-sm border border-blue-100 overflow-hidden">
                   <div className="bg-blue-50 px-4 py-3 border-b border-blue-100 flex items-center gap-2">
                        <Sparkles className="w-5 h-5 text-blue-500" /> 
                        <h3 className="font-bold text-blue-800">라운드 리포트 요약</h3>
                   </div>
                   <div className="p-5 prose prose-sm prose-blue text-gray-600 leading-relaxed max-w-none">
                        <ReactMarkdown>{lesson.aiAnalysis}</ReactMarkdown>
                   </div>
              </div>
          )}

          {/* Lesson Report Summary Card (Lesson/Practice Mode) */}
          {showAiAnalysis && lesson.recordType !== 'SCORE' && (
            <div className="bg-white rounded-xl shadow-sm border border-emerald-100 overflow-hidden">
                <div className="bg-emerald-50 px-4 py-3 border-b border-emerald-100 flex justify-between items-center">
                    <h3 className="font-bold text-emerald-800 flex items-center gap-2">
                        <Sparkles className="w-5 h-5 text-emerald-700" /> 
                        레슨 리포트 요약
                    </h3>
                    <div className="flex gap-2">
                        {/* Audio Synthesis Controls */}
                        {lesson.aiAnalysis && (
                            <>
                                <button 
                                    onClick={isSpeaking ? handleStopSpeak : handleSpeakAnalysis}
                                    className={`p-1.5 rounded-full transition-colors ${isSpeaking ? 'bg-emerald-200 text-emerald-700 animate-pulse' : 'hover:bg-emerald-200 text-emerald-600'}`}
                                    title={isSpeaking ? "읽기 중지" : "요약 내용 듣기"}
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
                            <p className="text-gray-500 text-sm mb-4">아직 레슨 요약 리포트가 없습니다.</p>
                            {canEdit && (
                                <Button 
                                    onClick={handleGenerateAIAnalysis} 
                                    isLoading={isGeneratingAnalysis}
                                    className="bg-emerald-800 hover:bg-emerald-900 text-white shadow-lg shadow-slate-200"
                                    icon={<Wand2 className="w-4 h-4" />}
                                >
                                    레슨 요약 리포트 생성하기
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
                          className="w-full p-3 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-700 outline-none resize-none"
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
                          <Button onClick={saveClientFeedback} className="bg-emerald-800 text-white px-4 py-2 text-sm">
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
                         <button onClick={startScreenCapture} className="aspect-square bg-gray-800 rounded-2xl flex flex-col items-center justify-center gap-3 text-white hover:bg-gray-700 transition-colors">
                             <MonitorPlay className="w-10 h-10 text-orange-400" />
                             <span className="font-bold">화면 녹화</span>
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

                 {addMode === 'SCREEN' && (
                     <div className="w-full max-w-2xl space-y-4">
                         <div className="relative bg-black rounded-2xl overflow-hidden aspect-video">
                             <video ref={videoPreviewRef} autoPlay muted playsInline className="w-full h-full object-contain" />
                             {isRecording && (
                                 <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-red-600 px-3 py-1 rounded-full text-white font-bold text-sm flex items-center gap-2 animate-pulse">
                                     <div className="w-2 h-2 bg-white rounded-full" />
                                     {Math.floor(recordingTime/60)}:{String(recordingTime%60).padStart(2,'0')}
                                 </div>
                             )}
                         </div>
                          <div className="flex justify-center gap-4">
                              {!isRecording ? (
                                  <>
                                      <button onClick={takePhoto} className="bg-white text-gray-900 hover:bg-gray-100 px-6 py-3 rounded-full text-lg font-bold flex items-center gap-2 border-2 border-gray-300">
                                          <Camera className="w-5 h-5" />
                                          사진 캡처
                                      </button>
                                      <button onClick={startRecordingScreen} className="bg-red-600 hover:bg-red-700 text-white px-8 py-3 rounded-full text-lg font-bold flex items-center gap-2">
                                          <div className="w-3 h-3 bg-white rounded-full" />
                                          녹화 시작
                                      </button>
                                  </>
                              ) : (
                                  <button onClick={stopRecording} className="bg-white text-red-600 hover:bg-gray-100 px-8 py-3 rounded-full text-lg font-bold flex items-center gap-2 border-2 border-red-600">
                                      <Square className="w-4 h-4 fill-red-600" />
                                     녹화 중지
                                 </button>
                             )}
                         </div>
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
                         {/* Role selection for video media */}
                         {capturedMedia.type === 'video' && (
                           <div className="space-y-1">
                             <p className="text-white/70 text-xs text-center">{t('lesson_compare_role_select')}</p>
                             <div className="flex gap-2 justify-center">
                               {(['BEFORE', 'AFTER', undefined] as const).map((role) => (
                                 <button
                                   key={String(role)}
                                   onClick={() => setPendingRole(role)}
                                   className={`px-4 py-1.5 rounded-full text-xs font-bold transition-colors ${
                                     pendingRole === role
                                       ? role === 'BEFORE' ? 'bg-blue-600 text-white' :
                                         role === 'AFTER'  ? 'bg-emerald-600 text-white' :
                                         'bg-gray-400 text-white'
                                       : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                                   }`}
                                 >
                                   {role === 'BEFORE' ? t('lesson_compare_role_before') :
                                    role === 'AFTER'  ? t('lesson_compare_role_after') :
                                    t('lesson_compare_role_none')}
                                 </button>
                               ))}
                             </div>
                           </div>
                         )}
                         <div className="flex gap-3">
                             <Button onClick={closeAddModal} variant="secondary" className="flex-1 bg-gray-800 text-white border-gray-700 hover:bg-gray-700">{t('lesson_redo')}</Button>
                             <Button onClick={saveAdditionalMedia} className="flex-[2] bg-emerald-800 hover:bg-emerald-900 text-white">{t('lesson_save_media')}</Button>
                         </div>
                     </div>
                 )}
             </div>
        </div>
      )}

      {/* Video Editor Modal */}
      {showVideoEditor && (
          <VideoEditor
              videoUrl={
                lesson.editedVideoUrl
                  ? (resolvedEditedUrl || (!lesson.editedVideoUrl.startsWith(IDB_PREFIX) ? resolveMediaUrl(lesson.editedVideoUrl) : resolveMediaUrl(lesson.videoUrl)))
                  : resolveMediaUrl(lesson.videoUrl)
              }
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
