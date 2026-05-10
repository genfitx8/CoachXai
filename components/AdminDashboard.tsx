
import React, { useState, useEffect, useMemo } from 'react';
import { ClientProfile, Lesson, CoachProfile, FirebaseConfig, HomeworkTemplate, NotificationMessage } from '../types';
import { Button } from './Button';
import { Users, FileText, Trash2, LogOut, RefreshCcw, ShieldAlert, CreditCard, CheckCircle, XCircle, Activity, LayoutDashboard, UserX, Database, Video, Mic, Image as ImageIcon, User, Award, Calendar, Cloud, Save, AlertTriangle, ListChecks, Plus, Send, Bell, MessageSquare, Megaphone, MapPin, Briefcase, Search, Eye, EyeOff, Building2, Sparkles } from 'lucide-react';
import { firebaseService } from '../services/firebase';
import { storageService } from '../services/storage';
import { AdminCourseManager } from './AdminCourseManager';
import { AdminBranchManager } from './AdminBranchManager';
import { AdminBranchStaffManager } from './AdminBranchStaffManager';
import { AdminPromptManager } from './AdminPromptManager';
import { AdminCoachActivity } from './AdminCoachActivity';
import { useLanguage } from './LanguageContext';
import { createLogger } from '../utils/logger';

const log = createLogger('adminDashboard');

interface AdminDashboardProps {
  clients: ClientProfile[];
  lessons: Lesson[];
  coaches: CoachProfile[]; 
  coachProfile: CoachProfile | null;
  onDeleteClient: (client: ClientProfile) => void;
  onDeleteCoach: (coach: CoachProfile) => void;
  onDeleteLesson: (lessonId: string) => void;
  onResetSystem: () => void;
  onLogout: () => void;
  onToggleSubscription: (user: ClientProfile | CoachProfile) => void;
  onGrantTrial: (user: ClientProfile | CoachProfile) => void;
  onChangeSubscriptionPlan: (
    user: ClientProfile | CoachProfile,
    plan: 'FREE' | 'PRO'
  ) => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  clients,
  lessons,
  coaches,
  coachProfile,
  onDeleteClient,
  onDeleteCoach,
  onDeleteLesson,
  onResetSystem,
  onLogout,
  onToggleSubscription,
  onGrantTrial,
  onChangeSubscriptionPlan
}) => {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState<'CLIENTS' | 'LESSONS' | 'SYSTEM' | 'TEMPLATES' | 'MESSAGES' | 'COURSES' | 'BRANCHES' | 'BRANCH_STAFF' | 'AI_PROMPTS' | 'COACH_ACTIVITY'>('CLIENTS');
  const [memberType, setMemberType] = useState<'GENERAL' | 'COACH'>('GENERAL'); 
  
  // Media visibility toggle
  const [showMedia, setShowMedia] = useState<boolean>(() => {
    const saved = localStorage.getItem('admin_showMedia');
    return saved ? JSON.parse(saved) : false; // Default to hidden (false)
  });
  
  // Firebase Config State
  const [fbConfig, setFbConfig] = useState<string>('');
  const [isFbConnected, setIsFbConnected] = useState(false);

  // Template State
  const [templates, setTemplates] = useState<HomeworkTemplate[]>([]);
  const [newTemplateTitle, setNewTemplateTitle] = useState('');

  // Messaging State
  const [messages, setMessages] = useState<NotificationMessage[]>([]);
  const [msgTarget, setMsgTarget] = useState<'ALL' | 'COACHES' | 'CLIENTS'>('ALL');
  const [msgTitle, setMsgTitle] = useState('');
  const [msgBody, setMsgBody] = useState('');
  const [isSendingMsg, setIsSendingMsg] = useState(false);

  // Subscription Management State
  const [subSearchTerm, setSubSearchTerm] = useState('');
  const [selectedSubUser, setSelectedSubUser] = useState<ClientProfile | CoachProfile | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<'FREE' | 'PRO'>('FREE');

  useEffect(() => {
    if (!selectedSubUser) return;
    if (selectedSubUser.subscriptionPlan) {
      setSelectedPlan(selectedSubUser.subscriptionPlan);
      return;
    }
    setSelectedPlan(selectedSubUser.isSubscribed ? 'PRO' : 'FREE');
  }, [selectedSubUser]);

  useEffect(() => {
    setSelectedSubUser((prev) => {
      if (!prev) return prev;
      if (isCoach(prev)) {
        return coaches.find((coach) => coach.id === prev.id) ?? prev;
      }
      return (
        clients.find(
          (client) => client.name === prev.name && client.phone === prev.phone
        ) ?? prev
      );
    });
  }, [clients, coaches]);

  useEffect(() => {
    // Load existing config
    const saved = firebaseService.getSavedConfig();
    if (saved) {
        setFbConfig(JSON.stringify(saved, null, 2));
        setIsFbConnected(firebaseService.isInitialized());
    }

    // Load templates
    loadTemplates();

    // Load messages
    loadMessages();
  }, [isFbConnected]);

  const loadTemplates = async () => {
      if (isFbConnected) {
          const loaded = await firebaseService.getHomeworkTemplates();
          setTemplates(loaded);
      } else {
          setTemplates(storageService.getHomeworkTemplates());
      }
  };

  const loadMessages = async () => {
      if (isFbConnected) {
          const msgs = await firebaseService.getNotifications();
          setMessages(msgs);
      } else {
          setMessages(storageService.getNotifications());
      }
  };

  const handleDeleteClient = (client: ClientProfile) => {
    if (confirm(`정말 ${client.name} 회원을 삭제하시겠습니까?\n이 회원의 모든 레슨 기록도 함께 삭제될 수 있습니다.`)) {
      onDeleteClient(client);
    }
  };

  const handleDeleteCoach = (coach: CoachProfile) => {
    if (confirm(`정말 ${coach.name} 코치를 삭제하시겠습니까?\n이 코치가 관리하던 회원의 담당 코치 정보도 함께 제거됩니다.`)) {
      onDeleteCoach(coach);
    }
  };

  const handleDeleteLessonAction = (lessonId: string) => {
      if (confirm("이 레슨 기록을 강제로 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.")) {
          onDeleteLesson(lessonId);
      }
  }

  const toggleShowMedia = () => {
      const newValue = !showMedia;
      setShowMedia(newValue);
      localStorage.setItem('admin_showMedia', JSON.stringify(newValue));
  };

  const handleReset = () => {
    if (confirm("경고: 모든 데이터가 초기화됩니다.\n코치 정보, 회원 목록, 레슨 기록 등 모든 데이터가 영구적으로 삭제됩니다.\n계속하시겠습니까?")) {
      if (confirm("정말로 모든 데이터를 삭제하고 시스템을 초기화하시겠습니까? 이 작업은 되돌릴 수 없습니다.")) {
        onResetSystem();
      }
    }
  };

  const handleSaveFirebaseConfig = () => {
      try {
          const config: FirebaseConfig = JSON.parse(fbConfig);
          const success = firebaseService.init(config);
          if (success) {
              setIsFbConnected(true);
              alert("Firebase가 성공적으로 연결되었습니다! 이제 데이터가 클라우드에 저장됩니다.");
              window.location.reload(); 
          } else {
              alert("Firebase 초기화 실패. 설정 값을 확인해주세요.");
          }
      } catch (e) {
          alert("유효하지 않은 JSON 형식입니다.");
      }
  };

  const handleAddTemplate = async () => {
      if (!newTemplateTitle.trim()) return;
      const newTemplate: HomeworkTemplate = {
          id: crypto.randomUUID(),
          title: newTemplateTitle.trim()
      };

      if (isFbConnected) {
          await firebaseService.saveHomeworkTemplate(newTemplate);
      } else {
          storageService.saveHomeworkTemplates([...templates, newTemplate]);
      }
      
      setTemplates(prev => [...prev, newTemplate]);
      setNewTemplateTitle('');
  };

  const handleDeleteTemplate = async (id: string) => {
      if(!confirm("이 템플릿을 삭제하시겠습니까?")) return;

      if (isFbConnected) {
          await firebaseService.deleteHomeworkTemplate(id);
      } else {
          const updated = templates.filter(t => t.id !== id);
          storageService.saveHomeworkTemplates(updated);
      }
      setTemplates(prev => prev.filter(t => t.id !== id));
  };

  const handleSendMessage = async () => {
      if (!msgTitle.trim() || !msgBody.trim()) {
          alert("제목과 내용을 모두 입력해주세요.");
          return;
      }
      
      setIsSendingMsg(true);
      const newMsg: NotificationMessage = {
          id: crypto.randomUUID(),
          target: msgTarget,
          title: msgTitle.trim(),
          body: msgBody.trim(),
          createdAt: Date.now()
      };

      try {
          if (isFbConnected) {
              await firebaseService.sendNotification(newMsg);
          } else {
              storageService.saveNotification(newMsg);
          }
          setMessages(prev => [newMsg, ...prev]);
          setMsgTitle('');
          setMsgBody('');
          alert("메시지가 성공적으로 전송되었습니다.");
      } catch (e) {
          log.error(e);
          alert(t('admin_message_send_failed'));
      } finally {
          setIsSendingMsg(false);
      }
  };

  const getMediaIcon = (type: 'video' | 'image' | 'audio') => {
      switch(type) {
          case 'video': return <Video className="w-4 h-4" />;
          case 'image': return <ImageIcon className="w-4 h-4" />;
          case 'audio': return <Mic className="w-4 h-4" />;
          default: return <FileText className="w-4 h-4" />;
      }
  };

  const isCoach = (user: any): user is CoachProfile => 'id' in user;

  const subscriptionSearchResults = useMemo(() => {
      if (!subSearchTerm.trim()) return [];
      const term = subSearchTerm.toLowerCase();
      
      const matchedClients = clients.filter(c => c.name.toLowerCase().includes(term) || c.phone.includes(term));
      const matchedCoaches = coaches.filter(c => c.name.toLowerCase().includes(term) || (c.email && c.email.toLowerCase().includes(term)));
      
      return [...matchedCoaches, ...matchedClients];
  }, [subSearchTerm, clients, coaches]);

  const openSubscriptionManager = (user: ClientProfile | CoachProfile) => {
    setSelectedSubUser(user);
    setSubSearchTerm('');
    setActiveTab('SYSTEM');
  };

  return (
    <div className="min-h-screen bg-bg-overlay font-sans">
      <header className="bg-gray-900 text-white shadow-lg sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
             <div className="bg-red-600 p-1.5 rounded-lg">
                <ShieldAlert className="w-6 h-6 text-white" />
             </div>
             <div>
                <h1 className="text-xl font-bold leading-none">CoachX Admin</h1>
                <p className="text-[10px] text-ink-muted font-mono">SYSTEM ADMINISTRATOR</p>
             </div>
          </div>
          <button 
            onClick={onLogout}
            className="flex items-center gap-2 text-sm font-medium text-ink-muted hover:text-white transition-colors"
          >
            <LogOut className="w-4 h-4" /> 로그아웃
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Member Count Card - Updated Design */}
          <div className="bg-bg-raised p-6 rounded-xl shadow-sm border border-line-default flex flex-col sm:flex-row items-start sm:items-center gap-4">
             <div className="w-14 h-14 bg-interactive-500/10 rounded-full flex flex-shrink-0 items-center justify-center text-blue-600">
                <Users className="w-8 h-8" />
             </div>
             <div className="flex-1 w-full">
                <p className="text-sm text-ink-medium font-medium">총 회원 수</p>
                <div className="flex items-baseline gap-1 mb-2">
                    <h3 className="text-3xl font-bold text-ink-high">{clients.length + coaches.length}</h3>
                    <span className="text-sm text-ink-muted">명</span>
                </div>
                
                <div className="flex gap-2">
                    <div className="flex-1 bg-primary-500/10 rounded-lg p-2 flex items-center justify-between border border-indigo-100">
                        <span className="text-xs text-indigo-600 font-bold">코치</span>
                        <span className="text-sm font-bold text-primary-200">{coaches.length}</span>
                    </div>
                    <div className="flex-1 bg-bg-base rounded-lg p-2 flex items-center justify-between border border-line-default">
                        <span className="text-xs text-ink-medium font-bold">일반</span>
                        <span className="text-sm font-bold text-ink-high">{clients.length}</span>
                    </div>
                </div>
             </div>
          </div>
          
          <div className="bg-bg-raised p-6 rounded-xl shadow-sm border border-line-default flex items-center gap-4">
             <div className="w-14 h-14 bg-primary-500/10 rounded-full flex items-center justify-center text-emerald-600">
                <FileText className="w-8 h-8" />
             </div>
             <div>
                <p className="text-sm text-ink-medium font-medium">누적 레슨 수</p>
                <h3 className="text-3xl font-bold text-ink-high">{lessons.length}개</h3>
             </div>
          </div>

          <div className="bg-bg-raised p-6 rounded-xl shadow-sm border border-line-default flex items-center gap-4">
             <div className="w-14 h-14 bg-primary-500/10 rounded-full flex items-center justify-center text-indigo-600">
                {isFbConnected ? <Cloud className="w-8 h-8" /> : <Activity className="w-8 h-8" />}
             </div>
             <div>
                <p className="text-sm text-ink-medium font-medium">시스템 상태</p>
                <div className="flex items-center gap-2">
                    <h3 className="text-xl font-bold text-ink-high">
                        {isFbConnected ? "Online" : "Local Mode"}
                    </h3>
                    {isFbConnected && <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>}
                </div>
                <p className="text-xs text-ink-muted">
                    {isFbConnected ? "Firebase DB Connected" : "Local Storage Only"}
                </p>
             </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-line-default flex gap-6 overflow-x-auto">
            <button 
                onClick={() => setActiveTab('CLIENTS')}
                className={`pb-3 text-sm font-bold transition-colors border-b-2 whitespace-nowrap ${activeTab === 'CLIENTS' ? 'border-gray-900 text-ink-high' : 'border-transparent text-ink-muted hover:text-ink-medium'}`}
            >
                {t('admin_tab_clients')}
            </button>
            <button 
                onClick={() => setActiveTab('COACH_ACTIVITY')}
                className={`pb-3 text-sm font-bold transition-colors border-b-2 whitespace-nowrap flex items-center gap-1.5 ${activeTab === 'COACH_ACTIVITY' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-ink-muted hover:text-ink-medium'}`}
            >
                <Activity className="w-3.5 h-3.5" /> {t('admin_tab_coach_activity')}
            </button>
            <button 
                onClick={() => setActiveTab('LESSONS')}
                className={`pb-3 text-sm font-bold transition-colors border-b-2 whitespace-nowrap ${activeTab === 'LESSONS' ? 'border-gray-900 text-ink-high' : 'border-transparent text-ink-muted hover:text-ink-medium'}`}
            >
                레슨 관리
            </button>
            <button 
                onClick={() => setActiveTab('COURSES')}
                className={`pb-3 text-sm font-bold transition-colors border-b-2 whitespace-nowrap ${activeTab === 'COURSES' ? 'border-gray-900 text-ink-high' : 'border-transparent text-ink-muted hover:text-ink-medium'}`}
            >
                {t('admin_tab_golf_courses')}
            </button>
            <button 
                onClick={() => setActiveTab('TEMPLATES')}
                className={`pb-3 text-sm font-bold transition-colors border-b-2 whitespace-nowrap ${activeTab === 'TEMPLATES' ? 'border-gray-900 text-ink-high' : 'border-transparent text-ink-muted hover:text-ink-medium'}`}
            >
                {t('admin_tab_templates')}
            </button>
            <button 
                onClick={() => setActiveTab('MESSAGES')}
                className={`pb-3 text-sm font-bold transition-colors border-b-2 whitespace-nowrap ${activeTab === 'MESSAGES' ? 'border-gray-900 text-ink-high' : 'border-transparent text-ink-muted hover:text-ink-medium'}`}
            >
                {t('admin_tab_send_message')}
            </button>
            <button 
                onClick={() => setActiveTab('SYSTEM')}
                className={`pb-3 text-sm font-bold transition-colors border-b-2 whitespace-nowrap ${activeTab === 'SYSTEM' ? 'border-gray-900 text-ink-high' : 'border-transparent text-ink-muted hover:text-ink-medium'}`}
            >
                {t('admin_tab_system')}
            </button>
            <button 
                onClick={() => setActiveTab('BRANCHES')}
                className={`pb-3 text-sm font-bold transition-colors border-b-2 whitespace-nowrap ${activeTab === 'BRANCHES' ? 'border-gray-900 text-ink-high' : 'border-transparent text-ink-muted hover:text-ink-medium'}`}
            >
                {t('admin_tab_branches')}
            </button>
            <button 
                onClick={() => setActiveTab('BRANCH_STAFF')}
                className={`pb-3 text-sm font-bold transition-colors border-b-2 whitespace-nowrap ${activeTab === 'BRANCH_STAFF' ? 'border-gray-900 text-ink-high' : 'border-transparent text-ink-muted hover:text-ink-medium'}`}
            >
                {t('admin_tab_branch_staff')}
            </button>
            <button 
                onClick={() => setActiveTab('AI_PROMPTS')}
                className={`pb-3 text-sm font-bold transition-colors border-b-2 whitespace-nowrap flex items-center gap-1.5 ${activeTab === 'AI_PROMPTS' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-ink-muted hover:text-ink-medium'}`}
            >
                <Sparkles className="w-3.5 h-3.5" /> {t('admin_tab_prompts')}
            </button>
        </div>

        {/* Content Area */}
        <div className="animate-fade-in">
            {activeTab === 'CLIENTS' && (
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <h2 className="text-lg font-bold text-ink-high flex items-center gap-2">
                            <Users className="w-5 h-5" /> {t('admin_member_management')}
                        </h2>
                        {/* Member Type Toggle */}
                        <div className="flex bg-bg-inset p-1 rounded-lg">
                            <button 
                                onClick={() => setMemberType('GENERAL')}
                                className={`px-4 py-1.5 text-sm font-bold rounded-md transition-all ${memberType === 'GENERAL' ? 'bg-bg-raised text-ink-high shadow-sm' : 'text-ink-medium hover:text-ink-high'}`}
                            >
                                {t('admin_general_members')} ({clients.length})
                            </button>
                            <button 
                                onClick={() => setMemberType('COACH')}
                                className={`px-4 py-1.5 text-sm font-bold rounded-md transition-all ${memberType === 'COACH' ? 'bg-bg-raised text-indigo-600 shadow-sm' : 'text-ink-medium hover:text-ink-high'}`}
                            >
                                코치 회원 ({coaches.length})
                            </button>
                        </div>
                    </div>

                    <div className="bg-bg-raised rounded-xl shadow-sm border border-line-default overflow-hidden">
                        {memberType === 'GENERAL' ? (
                            <table className="w-full text-sm text-left">
                                <thead className="bg-bg-base text-ink-medium font-medium border-b border-line-default">
                                    <tr>
                                        <th className="px-6 py-3">이름</th>
                                        <th className="px-6 py-3">전화번호</th>
                                        <th className="px-6 py-3">담당 코치</th>
                                        <th className="px-6 py-3">구독 상태</th>
                                        <th className="px-6 py-3 text-right">관리</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {clients.length === 0 ? (
                                        <tr><td colSpan={5} className="px-6 py-8 text-center text-ink-muted">{t('admin_no_general_members')}</td></tr>
                                    ) : (
                                        clients.map((client) => (
                                            <tr key={`${client.name}-${client.phone}`} className="hover:bg-bg-base transition-colors">
                                                <td className="px-6 py-4 font-medium text-ink-high">{client.name}</td>
                                                <td className="px-6 py-4 text-ink-medium">{client.phone}</td>
                                                <td className="px-6 py-4 text-ink-medium">
                                                    {client.designatedCoach ? <span className="inline-flex items-center gap-1 bg-primary-500/10 text-primary-300 px-2 py-0.5 rounded text-xs font-bold"><Award className="w-3 h-3"/> {client.designatedCoach}</span> : '-'}
                                                </td>
                                                <td className="px-6 py-4">
                                                    {client.isSubscribed ? 
                                                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold bg-primary-500/15 text-primary-300"><CheckCircle className="w-3 h-3" /> 구독 중</span> : 
                                                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold bg-bg-overlay text-ink-medium">무료 회원</span>
                                                    }
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="flex justify-end gap-2">
                                                        <button
                                                            data-testid={`manage-subscription-${client.phone}`}
                                                            onClick={() => openSubscriptionManager(client)}
                                                            className="text-emerald-600 hover:text-primary-200 hover:bg-primary-500/10 p-2 rounded-lg transition-colors flex items-center gap-1 text-xs font-bold"
                                                        >
                                                            <CreditCard className="w-4 h-4" /> 구독 관리
                                                        </button>
                                                        <button onClick={() => handleDeleteClient(client)} className="text-red-400 hover:text-red-400 hover:bg-red-500/10 p-2 rounded-lg transition-colors"><Trash2 className="w-4 h-4" /></button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        ) : (
                            <table className="w-full text-sm text-left">
                                <thead className="bg-primary-500/10 text-primary-300 font-medium border-b border-indigo-100">
                                    <tr>
                                        <th className="px-6 py-3">코치 이름</th>
                                        <th className="px-6 py-3">이메일</th>
                                        <th className="px-6 py-3">전화번호</th>
                                        <th className="px-6 py-3">관리 회원수</th>
                                        <th className="px-6 py-3">구독(Premium)</th>
                                        <th className="px-6 py-3 text-right">관리</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {coaches.length === 0 ? (
                                        <tr><td colSpan={6} className="px-6 py-8 text-center text-ink-muted">등록된 코치 회원이 없습니다.</td></tr>
                                    ) : (
                                        coaches.map((coach) => {
                                            const managedCount = clients.filter(c => c.coachId === coach.id || c.designatedCoach === coach.name).length;
                                            return (
                                                <tr key={coach.id} className="hover:bg-primary-500/10/30 transition-colors">
                                                    <td className="px-6 py-4 font-bold text-ink-high flex items-center gap-2">
                                                        <div className="w-8 h-8 rounded-full bg-primary-500/15 text-indigo-600 flex items-center justify-center text-xs">
                                                            {coach.name.charAt(0)}
                                                        </div>
                                                        {coach.name}
                                                    </td>
                                                    <td className="px-6 py-4 text-ink-medium">{coach.email}</td>
                                                    <td className="px-6 py-4 text-ink-medium">{coach.phone || '-'}</td>
                                                    <td className="px-6 py-4">
                                                        <span className="inline-flex items-center gap-1 bg-bg-overlay px-2 py-1 rounded text-xs font-bold text-ink-medium">
                                                            <Users className="w-3 h-3" /> {managedCount}명
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        {coach.isSubscribed ? 
                                                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold bg-primary-500/15 text-primary-300"><CheckCircle className="w-3 h-3" /> Premium</span> : 
                                                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold bg-bg-overlay text-ink-medium">Free Plan</span>
                                                        }
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <div className="flex justify-end gap-2">
                                                            <button
                                                                data-testid={`manage-subscription-${coach.id}`}
                                                                onClick={() => openSubscriptionManager(coach)}
                                                                className="text-indigo-600 hover:text-primary-200 hover:bg-primary-500/10 p-2 rounded-lg transition-colors flex items-center gap-1 text-xs font-bold"
                                                            >
                                                                <CreditCard className="w-4 h-4" /> 구독 관리
                                                            </button>
                                                            <button onClick={() => handleDeleteCoach(coach)} className="text-red-400 hover:text-red-400 hover:bg-red-500/10 p-2 rounded-lg transition-colors"><Trash2 className="w-4 h-4" /></button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
            )}

            {activeTab === 'COACH_ACTIVITY' && (
                <AdminCoachActivity coaches={coaches} lessons={lessons} clients={clients} />
            )}

            {activeTab === 'LESSONS' && (
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <h2 className="text-lg font-bold text-ink-high flex items-center gap-2">
                            <FileText className="w-5 h-5" /> 전체 레슨 목록 ({lessons.length})
                        </h2>
                        <button 
                            onClick={toggleShowMedia}
                            className={`p-2 rounded-lg transition-colors flex items-center gap-2 ${showMedia ? 'bg-primary-500/15 text-emerald-600' : 'bg-bg-overlay text-ink-medium'}`}
                            title={showMedia ? '미디어 숨기기' : '미디어 표시'}
                        >
                            {showMedia ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                            <span className="text-xs font-medium">{showMedia ? '미디어 표시' : '미디어 숨김'}</span>
                        </button>
                    </div>
                    <div className="bg-bg-raised rounded-xl shadow-sm border border-line-default overflow-hidden">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-bg-base text-ink-medium font-medium border-b border-line-default">
                                <tr>
                                    <th className="px-6 py-3">날짜</th>
                                    <th className="px-6 py-3">제목</th>
                                    <th className="px-6 py-3">회원명</th>
                                    <th className="px-6 py-3">작성자</th>
                                    {showMedia && <th className="px-6 py-3">미디어</th>}
                                    <th className="px-6 py-3 text-right">관리</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {lessons.length === 0 ? (
                                    <tr><td colSpan={showMedia ? 6 : 5} className="px-6 py-8 text-center text-ink-muted">등록된 레슨이 없습니다.</td></tr>
                                ) : (
                                    lessons.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map((lesson) => (
                                        <tr key={lesson.id} className="hover:bg-bg-base transition-colors">
                                            <td className="px-6 py-4 text-ink-medium whitespace-nowrap flex items-center gap-2"><Calendar className="w-3 h-3" /> {lesson.date}</td>
                                            <td className="px-6 py-4 font-medium text-ink-high truncate max-w-[200px]">{lesson.title}</td>
                                            <td className="px-6 py-4 text-ink-medium">{lesson.clientName}</td>
                                            <td className="px-6 py-4">
                                                {lesson.createdBy === 'COACH' ? 
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-primary-500/10 text-primary-300 border border-indigo-100"><Award className="w-3 h-3" /> PRO</span> : 
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-primary-500/10 text-primary-300 border border-emerald-100"><User className="w-3 h-3" /> CLIENT</span>
                                                }
                                            </td>
                                            {showMedia && <td className="px-6 py-4 text-ink-medium"><span className="flex items-center gap-1 capitalize">{getMediaIcon(lesson.mediaType)} {lesson.mediaType}</span></td>}
                                            <td className="px-6 py-4 text-right">
                                                <button onClick={() => handleDeleteLessonAction(lesson.id)} className="text-red-400 hover:text-red-400 hover:bg-red-500/10 p-2 rounded-lg transition-colors"><Trash2 className="w-4 h-4" /></button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {activeTab === 'COURSES' && (
                <AdminCourseManager isFirebaseMode={isFbConnected} />
            )}

            {activeTab === 'TEMPLATES' && (
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <h2 className="text-lg font-bold text-ink-high flex items-center gap-2">
                            <ListChecks className="w-5 h-5" /> {t('admin_tab_templates')}
                        </h2>
                    </div>

                    <div className="bg-bg-raised rounded-xl shadow-sm border border-line-default p-6">
                        <div className="flex gap-2 mb-6">
                            <input 
                                type="text" 
                                value={newTemplateTitle}
                                onChange={(e) => setNewTemplateTitle(e.target.value)}
                                placeholder="새로운 과제 내용을 입력하세요 (예: 빈 스윙 50회)" 
                                className="flex-1 px-4 py-2 border border-line-default rounded-lg focus:ring-2 focus:ring-emerald-700"
                                onKeyDown={(e) => e.key === 'Enter' && handleAddTemplate()}
                            />
                            <Button onClick={handleAddTemplate} icon={<Plus className="w-4 h-4" />}>추가</Button>
                        </div>

                        <div className="space-y-2">
                            {templates.length === 0 ? (
                                <p className="text-center text-ink-muted py-4">등록된 템플릿이 없습니다.</p>
                            ) : (
                                templates.map(t => (
                                    <div key={t.id} className="flex justify-between items-center p-3 bg-bg-base rounded-lg border border-line-subtle">
                                        <span className="font-medium text-ink-high">{t.title}</span>
                                        <button onClick={() => handleDeleteTemplate(t.id)} className="text-red-400 hover:text-red-400 p-1"><Trash2 className="w-4 h-4" /></button>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'MESSAGES' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Compose Message */}
                    <div className="space-y-4">
                        <h2 className="text-lg font-bold text-ink-high flex items-center gap-2">
                            <Megaphone className="w-5 h-5" /> {t('admin_send_push_message')}
                        </h2>
                        <div className="bg-bg-raised p-6 rounded-xl shadow-sm border border-line-default space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-ink-medium mb-1">수신 대상</label>
                                <div className="flex gap-2">
                                    <button 
                                        onClick={() => setMsgTarget('ALL')}
                                        className={`flex-1 py-2 text-sm font-bold rounded-lg border ${msgTarget === 'ALL' ? 'bg-gray-900 text-white border-gray-900' : 'bg-bg-raised text-ink-medium border-line-default'}`}
                                    >
                                        전체
                                    </button>
                                    <button 
                                        onClick={() => setMsgTarget('COACHES')}
                                        className={`flex-1 py-2 text-sm font-bold rounded-lg border ${msgTarget === 'COACHES' ? 'bg-slate-700 text-white border-slate-700' : 'bg-bg-raised text-ink-medium border-line-default'}`}
                                    >
                                        {t('admin_message_target_coaches')}
                                    </button>
                                    <button 
                                        onClick={() => setMsgTarget('CLIENTS')}
                                        className={`flex-1 py-2 text-sm font-bold rounded-lg border ${msgTarget === 'CLIENTS' ? 'bg-emerald-800 text-white border-emerald-600' : 'bg-bg-raised text-ink-medium border-line-default'}`}
                                    >
                                        {t('admin_message_target_members')}
                                    </button>
                                </div>
                            </div>
                            
                            <div>
                                <label className="block text-xs font-bold text-ink-medium mb-1">메시지 제목</label>
                                <input 
                                    type="text" 
                                    value={msgTitle}
                                    onChange={(e) => setMsgTitle(e.target.value)}
                                    placeholder="예: 긴급 시스템 점검 안내"
                                    className="w-full px-4 py-2 border border-line-default rounded-lg focus:ring-2 focus:ring-gray-500 outline-none"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-ink-medium mb-1">메시지 내용</label>
                                <textarea 
                                    value={msgBody}
                                    onChange={(e) => setMsgBody(e.target.value)}
                                    placeholder="전송할 내용을 입력하세요."
                                    rows={5}
                                    className="w-full px-4 py-2 border border-line-default rounded-lg focus:ring-2 focus:ring-gray-500 outline-none resize-none"
                                />
                            </div>

                            <Button 
                                onClick={handleSendMessage} 
                                isLoading={isSendingMsg} 
                                className="w-full py-3 bg-gray-900 hover:bg-black"
                                icon={<Send className="w-4 h-4" />}
                            >
                                {t('admin_send_message')}
                            </Button>
                        </div>
                    </div>

                    {/* Message History */}
                    <div className="space-y-4">
                        <h2 className="text-lg font-bold text-ink-high flex items-center gap-2">
                            <MessageSquare className="w-5 h-5" /> {t('admin_message_history')}
                        </h2>
                        <div className="bg-bg-raised rounded-xl shadow-sm border border-line-default overflow-hidden max-h-[500px] overflow-y-auto">
                            {messages.length === 0 ? (
                                <div className="p-8 text-center text-ink-muted text-sm">{t('admin_no_messages')}</div>
                            ) : (
                                <div className="divide-y divide-gray-100">
                                    {messages.map(msg => (
                                        <div key={msg.id} className="p-4 hover:bg-bg-base transition-colors">
                                            <div className="flex justify-between items-start mb-1">
                                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                                    msg.target === 'ALL' ? 'bg-bg-overlay text-ink-medium' : 
                                                    msg.target === 'COACHES' ? 'bg-primary-500/15 text-indigo-600' : 
                                                    'bg-primary-500/15 text-emerald-600'
                                                }`}>
                                                    {msg.target === 'ALL' ? t('admin_message_target_all') : msg.target === 'COACHES' ? t('admin_message_target_coaches') : t('admin_message_target_members')}
                                                </span>
                                                <span className="text-xs text-ink-muted">{new Date(msg.createdAt).toLocaleString()}</span>
                                            </div>
                                            <h4 className="font-bold text-ink-high text-sm mb-1">{msg.title}</h4>
                                            <p className="text-xs text-ink-medium line-clamp-2">{msg.body}</p>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'SYSTEM' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-bg-raised rounded-xl shadow-sm border border-line-default p-6 h-fit md:col-span-2">
                        <h2 className="text-lg font-bold text-ink-high mb-4 flex items-center gap-2"><Cloud className="w-5 h-5" /> Firebase DB 연결 설정</h2>
                        <textarea
                            value={fbConfig}
                            onChange={(e) => setFbConfig(e.target.value)}
                            placeholder='{ "apiKey": "...", "authDomain": "...", ... }'
                            className="w-full h-40 p-3 font-mono text-xs border border-line-default rounded-lg focus:ring-2 focus:ring-emerald-700 mb-4"
                        />
                        <div className="flex justify-end"><Button onClick={handleSaveFirebaseConfig} icon={<Save className="w-4 h-4" />}>설정 저장 및 연결 테스트</Button></div>
                    </div>
                    
                    <div className="bg-bg-raised rounded-xl shadow-sm border border-line-default p-6 h-fit">
                        <h2 className="text-lg font-bold text-ink-high mb-4 flex items-center gap-2"><CreditCard className="w-5 h-5" /> {t('admin_subscription_management')}</h2>
                        
                        <div className="relative mb-4">
                            <Search className="absolute left-3 top-2.5 w-4 h-4 text-ink-muted" />
                            <input 
                                type="text" 
                                placeholder="회원/코치 이름 또는 전화번호 검색" 
                                data-testid="admin-subscription-search-input"
                                value={subSearchTerm}
                                onChange={(e) => { setSubSearchTerm(e.target.value); setSelectedSubUser(null); }}
                                className="w-full pl-9 pr-4 py-2 border border-line-default rounded-lg text-sm focus:ring-2 focus:ring-emerald-700 outline-none"
                            />
                        </div>

                        {/* Search Results Dropdown */}
                        {subSearchTerm && !selectedSubUser && (
                            <div className="max-h-40 overflow-y-auto border border-line-default rounded-lg mb-4 bg-bg-base">
                                {subscriptionSearchResults.length === 0 ? (
                                    <div className="p-3 text-xs text-ink-medium text-center">검색 결과가 없습니다.</div>
                                ) : (
                                    subscriptionSearchResults.map((user, idx) => (
                                        <div 
                                            key={idx} 
                                            onClick={() => { setSelectedSubUser(user); setSubSearchTerm(''); }}
                                            className="p-2 hover:bg-bg-raised cursor-pointer border-b border-line-subtle last:border-0 flex justify-between items-center"
                                        >
                                            <div>
                                                <span className="font-bold text-sm text-ink-high">{user.name}</span>
                                                <span className="text-xs text-ink-medium ml-2">
                                                    {isCoach(user) ? '(코치)' : '(회원)'} {user.phone}
                                                </span>
                                            </div>
                                            {user.isSubscribed && <CheckCircle className="w-3 h-3 text-primary-300" />}
                                        </div>
                                    ))
                                )}
                            </div>
                        )}

                        {selectedSubUser ? (
                            <div className="space-y-4 animate-fade-in bg-bg-base p-4 rounded-xl border border-line-default">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <h3 className="font-bold text-ink-high">{selectedSubUser.name} <span className="text-xs font-normal text-ink-medium">{isCoach(selectedSubUser) ? '코치' : '회원'}</span></h3>
                                        <p className="text-xs text-ink-medium">{selectedSubUser.phone}</p>
                                    </div>
                                    <button onClick={() => setSelectedSubUser(null)} className="text-ink-muted hover:text-ink-medium"><XCircle className="w-4 h-4" /></button>
                                </div>

                                <div className="flex items-center justify-between p-3 bg-bg-raised rounded-lg border border-line-default">
                                    <span className="text-sm font-medium text-ink-medium">상태</span>
                                    {selectedSubUser.isSubscribed ? 
                                        <span className="text-emerald-600 font-bold flex items-center gap-1"><CheckCircle className="w-4 h-4" /> Premium</span> : 
                                        <span className="text-ink-medium font-bold flex items-center gap-1"><XCircle className="w-4 h-4" /> Free</span>
                                    }
                                </div>

                                {!isCoach(selectedSubUser) && (
                                    <div className="space-y-2 bg-bg-raised border border-line-default rounded-lg p-3">
                                        <label className="text-sm font-medium text-ink-medium">회원 구독 플랜</label>
                                        <div className="flex items-center gap-2">
                                            <select
                                                value={selectedPlan}
                                                onChange={(e) => setSelectedPlan(e.target.value as 'FREE' | 'PRO')}
                                                className="flex-1 px-3 py-2 border border-line-default rounded-lg text-sm focus:ring-2 focus:ring-emerald-700 outline-none"
                                            >
                                                <option value="FREE">FREE</option>
                                                <option value="PRO">PRO</option>
                                            </select>
                                            <Button
                                                onClick={() => onChangeSubscriptionPlan(selectedSubUser, selectedPlan)}
                                                className="text-sm px-3 py-2"
                                            >
                                                플랜 변경
                                            </Button>
                                        </div>
                                    </div>
                                )}
                                
                                {selectedSubUser.isSubscribed && selectedSubUser.subscriptionEndDate && (
                                    <div className="text-xs text-center text-ink-medium bg-bg-raised p-2 rounded border border-line-default">
                                        만료일: {new Date(selectedSubUser.subscriptionEndDate).toLocaleDateString()}
                                    </div>
                                )}

                                <div className="grid grid-cols-1 gap-2">
                                    <Button onClick={() => onToggleSubscription(selectedSubUser)} variant={selectedSubUser.isSubscribed ? "secondary" : "primary"} className="w-full text-sm py-2">
                                        {selectedSubUser.isSubscribed ? "구독 해제" : "구독 활성화"}
                                    </Button>
                                    <Button onClick={() => onGrantTrial(selectedSubUser)} variant="secondary" className="w-full border-emerald-200 text-primary-300 hover:bg-primary-500/10 text-sm py-2" icon={<Calendar className="w-3 h-3" />}>
                                        1주일 무료 체험
                                    </Button>
                                </div>
                            </div>
                        ) : (
                            !subSearchTerm && <div className="text-center py-4 text-ink-muted text-xs">회원이나 코치를 검색하여 구독을 관리하세요.</div>
                        )}
                    </div>

                    <div className="bg-red-500/10 rounded-xl shadow-sm border border-red-100 p-6 h-fit">
                        <h2 className="text-lg font-bold text-red-200 mb-4 flex items-center gap-2"><Database className="w-5 h-5" /> 데이터 초기화 (Danger)</h2>
                        <button onClick={handleReset} className="w-full py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg flex items-center justify-center gap-2"><RefreshCcw className="w-4 h-4" /> 전체 시스템 초기화</button>
                    </div>
                </div>
            )}

            {activeTab === 'BRANCHES' && (
                <AdminBranchManager isFirebaseMode={isFbConnected} />
            )}

            {activeTab === 'BRANCH_STAFF' && (
                <AdminBranchStaffManager isFirebaseMode={isFbConnected} />
            )}

            {activeTab === 'AI_PROMPTS' && (
                <AdminPromptManager isFirebaseMode={isFbConnected} />
            )}
        </div>
      </main>
    </div>
  );
};
