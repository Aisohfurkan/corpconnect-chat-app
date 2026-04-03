"use client";
import { useState, useEffect, useRef } from "react";
import { supabase } from "../lib/supabase";
import { User } from "@supabase/supabase-js";
import { 
  Building2, Key, Mail, Lock, User as UserIcon, LogIn, UserPlus, Hash, Send, LogOut, 
  MessageSquare, Paperclip, X, Image as ImageIcon, Camera, Circle, Trash2, Check, CheckCheck, 
  Volume2, VolumeX, Volume1, Mic, Square, Search, Reply, SmilePlus, PlusCircle, Settings, Users, ShieldAlert
} from "lucide-react";

// --- TİPLER (TYPES) ---
type Profile = { id: string; full_name: string; title: string; department?: string; avatar_url?: string; online?: boolean; last_msg_at?: string; unread_count?: number };
type Channel = { id: string; name: string; description: string; is_private: boolean; created_by: string; allowed_users: string[]; allowed_departments: string[]; moderators: string[] };
type Reaction = { emoji: string; users: string[] };
type Message = { id: string; content: string; file_url?: string; audio_url?: string; created_at: string; user_id?: string; sender_id?: string; receiver_id?: string; is_read?: boolean; reply_to_id?: string; reactions?: Reaction[]; profiles: Profile };

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isLogin, setIsLogin] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [inviteKey, setInviteKey] = useState("");

  const [channels, setChannels] = useState<Channel[]>([]);
  const [users, setUsers] = useState<Profile[]>([]);
  const [onlineUsers, setOnlineUsers] = useState<Record<string, boolean>>({});
  const [activeTarget, setActiveTarget] = useState<{ type: 'channel' | 'dm', data: any } | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [volume, setVolume] = useState(0.5);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [newMessage, setNewMessage] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const [isTyping, setIsTyping] = useState(false);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const typingChannelRef = useRef<any>(null);

  // --- KANAL YÖNETİM STATES ---
  const [showChannelModal, setShowChannelModal] = useState(false);
  const [newChannel, setNewChannel] = useState({ name: "", desc: "", isPrivate: false, selectedDepts: [] as string[], selectedUsers: [] as string[] });
  
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [editChannel, setEditChannel] = useState<Channel | null>(null);
  
  const [showMembersModal, setShowMembersModal] = useState(false);

  const availableDepartments = ['Yönetim Kurulu', 'IT & Yazılım', 'Finans & Muhasebe', 'Pazarlama & İletişim', 'İnsan Kaynakları', 'Satış Departmanı', 'Genel Merkez'];

  // ==========================================
  // 1. BAŞLANGIÇ & AUTH
  // ==========================================
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => { setUser(session?.user ?? null); setLoading(false); });
    const { data: authListener } = supabase.auth.onAuthStateChange((_e, session) => setUser(session?.user ?? null));
    return () => authListener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (user) {
      loadInitialData();
      const presenceChannel = supabase.channel('online-users', { config: { presence: { key: user.id } } });
      presenceChannel.on('presence', { event: 'sync' }, () => {
        const state = presenceChannel.presenceState();
        const online: Record<string, boolean> = {};
        Object.keys(state).forEach(key => online[key] = true);
        setOnlineUsers(online);
      }).subscribe(async (status) => { if (status === 'SUBSCRIBED') await presenceChannel.track({ online_at: new Date().toISOString() }); });
      return () => { presenceChannel.unsubscribe(); };
    }
  }, [user]);

  const loadInitialData = async (retryCount = 0) => {
    const { data: pData } = await supabase.from("profiles").select("*").eq("id", user!.id).single();
    if (pData) { setProfile(pData); } else if (retryCount < 5) { setTimeout(() => loadInitialData(retryCount + 1), 500); return; }
    await fetchChannels(pData);
    await loadUserList();
  };

  const fetchChannels = async (currentUserProfile: Profile | null = profile) => {
    const { data: cData } = await supabase.from("channels").select("*").order("created_at", { ascending: true });
    if (cData && currentUserProfile) {
      const visibleChannels = cData.filter(c => 
        !c.is_private || 
        c.created_by === user?.id || 
        (c.allowed_users && c.allowed_users.includes(user?.id)) || 
        (c.allowed_departments && c.allowed_departments.includes(currentUserProfile.department))
      );
      setChannels(visibleChannels);
      // Eğer aktif bir kanal varsa ve silindiyse veya yetkimiz gittiyse onu temizle
      if (activeTarget && activeTarget.type === 'channel' && !visibleChannels.find(vc => vc.id === activeTarget.data.id)) {
        setActiveTarget(null);
      } else if (!activeTarget && visibleChannels.length > 0) {
        setActiveTarget({ type: 'channel', data: visibleChannels[0] });
      }
    }
  };

  const loadUserList = async () => {
    if (!user) return;
    const { data: allUsers } = await supabase.from("profiles").select("*").neq("id", user.id);
    if (allUsers) {
      const usersWithStats = await Promise.all(allUsers.map(async (u) => {
        const { count } = await supabase.from("direct_messages").select('*', { count: 'exact', head: true }).eq('sender_id', u.id).eq('receiver_id', user.id).eq('is_read', false);
        const { data: lastMsg } = await supabase.from("direct_messages").select('created_at').or(`and(sender_id.eq.${user.id},receiver_id.eq.${u.id}),and(sender_id.eq.${u.id},receiver_id.eq.${user.id})`).order('created_at', { ascending: false }).limit(1).single();
        return { ...u, unread_count: count || 0, last_msg_at: lastMsg?.created_at || '1970-01-01' };
      }));
      setUsers(usersWithStats.sort((a, b) => new Date(b.last_msg_at).getTime() - new Date(a.last_msg_at).getTime()));
    }
  };

  // ==========================================
  // 2. 🛡️ YETKİ KONTROLÜ (GÜNCELLEME)
  // ==========================================
  const canManageActiveChannel = () => {
    // !user kontrolünü ekledik. Böylece aşağıdaki user.id'ler hata vermeyecek.
    if (activeTarget?.type !== 'channel' || !profile || !user) return false; 
    
    const c = activeTarget.data as Channel;
    const isIT = profile.department === 'IT & Yazılım';
    const isCreator = c.created_by === user.id;
    const isModerator = c.moderators?.includes(user.id);
    
    // Kurucu, Moderatör veya (Genel kanalsa) IT yönetebilir.
    return isCreator || isModerator || (isIT && !c.is_private);
  };

  const isChannelCreator = () => {
    if (activeTarget?.type !== 'channel') return false;
    return activeTarget.data.created_by === user?.id;
  };

  const getChannelMembers = () => {
    if (activeTarget?.type !== 'channel') return [];
    const c = activeTarget.data as Channel;
    const allCompanyUsers = profile ? [profile, ...users] : [...users];
    if (!c.is_private) return allCompanyUsers;
    return allCompanyUsers.filter(u => 
      c.created_by === u.id || 
      (c.allowed_users && c.allowed_users.includes(u.id)) || 
      (c.allowed_departments && u.department && c.allowed_departments.includes(u.department))
    );
  };

  const handleUpdateChannel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editChannel || !user) return;
    
    // Kurucunun her zaman içeride olmasını garanti edelim
    const safeAllowedUsers = Array.from(new Set([...editChannel.allowed_users, editChannel.created_by]));

    const payload = {
      name: editChannel.name,
      description: editChannel.description,
      allowed_users: safeAllowedUsers,
      allowed_departments: editChannel.allowed_departments,
      moderators: editChannel.moderators || []
    };

    const { error } = await supabase.from("channels").update(payload).eq("id", editChannel.id);
    if (!error) {
      setShowSettingsModal(false);
      fetchChannels();
      if (activeTarget?.data.id === editChannel.id) {
        setActiveTarget({ type: 'channel', data: { ...activeTarget.data, ...payload } });
      }
    } else {
      alert("Kanal güncellenirken bir hata oluştu.");
    }
  };

  const handleDeleteChannel = async (id: string) => {
    if (!confirm("Kanalı ve içindeki TÜM mesajları silmek istediğinize emin misiniz? Bu işlem geri alınamaz!")) return;
    await supabase.from("channels").delete().eq("id", id);
    setShowSettingsModal(false);
    setActiveTarget(null);
    fetchChannels();
  };

  // ==========================================
  // 3. REALTIME & MESAJLAR
  // ==========================================
  useEffect(() => {
    if (!activeTarget || !user || !profile) return;
    fetchMessages();
    setSearchQuery(""); setReplyingTo(null);

    const sub = supabase.channel('global-listener')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, () => { if (activeTarget.type === 'channel') fetchMessages(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'direct_messages' }, (payload) => {
        loadUserList();
        if (payload.eventType === 'INSERT' && payload.new.receiver_id === user.id) playNotificationSound();
        if (activeTarget.type === 'dm') fetchMessages();
      }).subscribe();

    const typingRoomId = activeTarget.type === 'channel' ? `ch-${activeTarget.data.id}` : `dm-${[user.id, activeTarget.data.id].sort().join('-')}`;
    typingChannelRef.current = supabase.channel(`typing:${typingRoomId}`, { config: { presence: { key: user.id } } });
    typingChannelRef.current.on('presence', { event: 'sync' }, () => {
      const state = typingChannelRef.current.presenceState();
      const typers = Object.keys(state).filter(key => key !== user.id && state[key][0]?.isTyping).map(key => state[key][0]?.name);
      setTypingUsers(typers);
    }).subscribe();

    return () => { supabase.removeChannel(sub); supabase.removeChannel(typingChannelRef.current); };
  }, [activeTarget]);

  const handleTyping = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNewMessage(e.target.value);
    if (!typingChannelRef.current || !profile) return;
    if (!isTyping) { setIsTyping(true); typingChannelRef.current.track({ isTyping: true, name: profile.full_name }); }
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => { setIsTyping(false); typingChannelRef.current.track({ isTyping: false, name: profile.full_name }); }, 1500);
  };

  const fetchMessages = async () => {
    if (!activeTarget || !user) return;
    const isChannel = activeTarget.type === 'channel';
    const query = isChannel ? supabase.from("messages").select(`*, profiles(*)`).eq("channel_id", activeTarget.data.id) : supabase.from("direct_messages").select(`*, profiles:sender_id(*)`).or(`and(sender_id.eq.${user.id},receiver_id.eq.${activeTarget.data.id}),and(sender_id.eq.${activeTarget.data.id},receiver_id.eq.${user.id})`);
    const { data } = await query.order("created_at", { ascending: true });
    if (data) { 
      setMessages(data as any); setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100); 
      if (!isChannel) {
        const unreadIds = (data as any[]).filter(m => m.receiver_id === user.id && !m.is_read).map(m => m.id);
        if (unreadIds.length > 0) { await supabase.from("direct_messages").update({ is_read: true }).in("id", unreadIds); loadUserList(); }
      }
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      audioChunksRef.current = [];
      mediaRecorderRef.current.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      mediaRecorderRef.current.onstop = async () => { const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' }); await uploadAndSendAudio(audioBlob); };
      mediaRecorderRef.current.start(); setIsRecording(true); setRecordingTime(0);
      timerRef.current = setInterval(() => setRecordingTime(p => p + 1), 1000);
    } catch (err) { alert("Mikrofon erişimi reddedildi."); }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop(); mediaRecorderRef.current.stream.getTracks().forEach(t => t.stop()); setIsRecording(false);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

  const uploadAndSendAudio = async (blob: Blob) => {
    setIsSending(true);
    const fileName = `voice-${user?.id}-${Date.now()}.webm`;
    const { error } = await supabase.storage.from('chat-attachments').upload(fileName, blob);
    if (!error) { const { data: { publicUrl } } = supabase.storage.from('chat-attachments').getPublicUrl(fileName); await executeMessageSend("", null, publicUrl); }
    setIsSending(false);
  };

  const executeMessageSend = async (text: string, fileUrl: string | null, audioUrl: string | null = null) => {
    const table = activeTarget?.type === 'channel' ? 'messages' : 'direct_messages';
    const payload = activeTarget?.type === 'channel' 
      ? { channel_id: activeTarget.data.id, user_id: user?.id, content: text, file_url: fileUrl, audio_url: audioUrl, reply_to_id: replyingTo?.id }
      : { sender_id: user?.id, receiver_id: activeTarget?.data.id, content: text, file_url: fileUrl, audio_url: audioUrl, reply_to_id: replyingTo?.id };
    await supabase.from(table).insert([payload]);
    setNewMessage(""); setFile(null); setReplyingTo(null); setIsSending(false); loadUserList();
    if (isTyping && typingChannelRef.current && profile) { setIsTyping(false); typingChannelRef.current.track({ isTyping: false, name: profile.full_name }); }
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!newMessage.trim() && !file) || !activeTarget || !user) return;
    setIsSending(true);
    let fUrl = null;
    if (file) {
      const fName = `${Math.random()}.${file.name.split('.').pop()}`; await supabase.storage.from('chat-attachments').upload(fName, file);
      fUrl = supabase.storage.from('chat-attachments').getPublicUrl(fName).data.publicUrl;
    }
    await executeMessageSend(newMessage, fUrl);
  };

  const deleteMessage = async (msgId: string) => {
    if (!confirm("Mesajı silmek istediğinize emin misiniz?")) return;
    const table = activeTarget?.type === 'channel' ? 'messages' : 'direct_messages';
    await supabase.from(table).delete().eq('id', msgId);
  };

  const toggleReaction = async (msg: Message, emoji: string) => {
    if(!user) return;
    const table = activeTarget?.type === 'channel' ? 'messages' : 'direct_messages';
    let currentReactions = msg.reactions || [];
    let existing = currentReactions.find(r => r.emoji === emoji);
    if (existing) {
      if (existing.users.includes(user.id)) existing.users = existing.users.filter(id => id !== user.id);
      else existing.users.push(user.id);
    } else currentReactions.push({ emoji, users: [user.id] });
    currentReactions = currentReactions.filter(r => r.users.length > 0);
    await supabase.from(table).update({ reactions: currentReactions }).eq('id', msg.id);
  };

  const handleCreateChannel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChannel.name.trim() || !user) return;
    const { error } = await supabase.from("channels").insert([{
      name: newChannel.name.trim().toLowerCase().replace(/\s+/g, '-'),
      description: newChannel.desc, created_by: user.id, is_private: newChannel.isPrivate,
      allowed_users: newChannel.isPrivate ? [...newChannel.selectedUsers, user.id] : [],
      allowed_departments: newChannel.isPrivate ? newChannel.selectedDepts : [],
      moderators: [] // Yeni kanalda henüz mod yok
    }]);
    if (!error) { setShowChannelModal(false); setNewChannel({ name: "", desc: "", isPrivate: false, selectedDepts: [], selectedUsers: [] }); fetchChannels(); } 
    else alert("Kanal oluşturulamadı.");
  };

  const playNotificationSound = () => { const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3'); audio.volume = volume; audio.play().catch(()=>{}); };
  const getOriginalMessage = (replyId?: string) => messages.find(m => m.id === replyId);
  const formatTime = (sec: number) => `${Math.floor(sec / 60)}:${(sec % 60).toString().padStart(2, '0')}`;
  const filteredMessages = messages.filter(m => m.content?.toLowerCase().includes(searchQuery.toLowerCase()));

  // AUTH HANDLE FUNCTIONS
  const handleRegister = async (e: any) => { e.preventDefault(); setErrorMsg(""); setIsLoading(true); try { const { data: keyData, error: keyError } = await supabase.from("invite_keys").select("*").eq("key_code", inviteKey).eq("is_used", false).single(); if (keyError || !keyData) throw new Error("Geçersiz davet kodu!"); const { data: authData, error: authError } = await supabase.auth.signUp({ email, password }); if (authError) throw authError; const { error: profileError } = await supabase.from("profiles").insert([{ id: authData.user!.id, full_name: fullName, title: keyData.title_name, department: keyData.department || 'Genel' }]); if (profileError) throw profileError; await supabase.from("invite_keys").update({ is_used: true }).eq("id", keyData.id); } catch (err: any) { setErrorMsg(err.message); } finally { setIsLoading(false); } };
  const handleLogin = async (e: any) => { e.preventDefault(); setErrorMsg(""); setIsLoading(true); const { error } = await supabase.auth.signInWithPassword({ email, password }); if (error) setErrorMsg("Hata!"); setIsLoading(false); };
  const handleAvatarUpload = async (e: any) => { if (!e.target.files || !user) return; const f = e.target.files[0]; const fName = `${user.id}-${Math.random()}.png`; await supabase.storage.from('avatars').upload(fName, f); const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(fName); await supabase.from("profiles").update({ avatar_url: publicUrl }).eq("id", user.id); setProfile(p => p ? { ...p, avatar_url: publicUrl } : null); };

  if (loading) return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-blue-500 font-mono">CORE_LOADING...</div>;

  if (user) {
    return (
      <div className="flex h-screen bg-slate-950 text-slate-300 overflow-hidden font-sans relative">
        
        {/* ========================================= */}
        {/* 🛠️ MODALLAR BÖLÜMÜ */}
        {/* ========================================= */}

        {/* 1. KANAL OLUŞTURMA MODALI */}
        {showChannelModal && (
          <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 max-w-md w-full shadow-2xl">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-white flex items-center gap-2"><PlusCircle className="text-blue-500"/> Yeni Kanal Oluştur</h2>
                <button onClick={() => setShowChannelModal(false)} className="text-slate-500 hover:text-white"><X size={20}/></button>
              </div>
              <form onSubmit={handleCreateChannel} className="space-y-4">
                <div><label className="text-xs text-slate-500 uppercase font-bold">Kanal Adı</label><input required type="text" className="w-full bg-slate-950 border border-slate-800 p-3 rounded-lg text-white focus:border-blue-500 mt-1" placeholder="örn: proje-alfa" value={newChannel.name} onChange={e=>setNewChannel({...newChannel, name: e.target.value})} /></div>
                <div><label className="text-xs text-slate-500 uppercase font-bold">Açıklama</label><input type="text" className="w-full bg-slate-950 border border-slate-800 p-3 rounded-lg text-white focus:border-blue-500 mt-1" value={newChannel.desc} onChange={e=>setNewChannel({...newChannel, desc: e.target.value})} /></div>
                <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer p-3 bg-slate-950 border border-slate-800 rounded-lg">
                  <input type="checkbox" className="accent-blue-500 w-4 h-4" checked={newChannel.isPrivate} onChange={e=>setNewChannel({...newChannel, isPrivate: e.target.checked})} /> Kanalı gizli yap
                </label>
                {newChannel.isPrivate && (
                  <div className="space-y-3 p-4 bg-slate-950/50 rounded-lg border border-slate-800">
                    <select multiple className="w-full bg-slate-900 border border-slate-700 p-2 rounded text-sm text-slate-300 h-24" value={newChannel.selectedDepts} onChange={e => setNewChannel({...newChannel, selectedDepts: Array.from(e.target.selectedOptions, o => o.value)})}>
                      <option disabled className="text-slate-500 font-bold">-- Departman İzinleri --</option>
                      {availableDepartments.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                    <select multiple className="w-full bg-slate-900 border border-slate-700 p-2 rounded text-sm text-slate-300 h-24" value={newChannel.selectedUsers} onChange={e => setNewChannel({...newChannel, selectedUsers: Array.from(e.target.selectedOptions, o => o.value)})}>
                      <option disabled className="text-slate-500 font-bold">-- Kişi İzinleri --</option>
                      {users.map(u => <option key={u.id} value={u.id}>{u.full_name} ({u.department})</option>)}
                    </select>
                  </div>
                )}
                <button type="submit" className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl mt-4">Kanalı Kur</button>
              </form>
            </div>
          </div>
        )}

        {/* 2. KANAL DÜZENLEME/SİLME MODALI (GELİŞMİŞ YETKİLENDİRME) */}
        {showSettingsModal && editChannel && (
          <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 max-w-lg w-full shadow-2xl max-h-[90vh] overflow-y-auto scrollbar-thin scrollbar-thumb-slate-800">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-white flex items-center gap-2"><Settings className="text-slate-400"/> Kanal Ayarları</h2>
                <button onClick={() => setShowSettingsModal(false)} className="text-slate-500 hover:text-white"><X size={20}/></button>
              </div>
              
              <form onSubmit={handleUpdateChannel} className="space-y-4">
                <div><label className="text-xs text-slate-500 uppercase font-bold">Kanal Adı</label><input required type="text" className="w-full bg-slate-950 border border-slate-800 p-3 rounded-lg text-white mt-1" value={editChannel.name} onChange={e=>setEditChannel({...editChannel, name: e.target.value})} /></div>
                <div><label className="text-xs text-slate-500 uppercase font-bold">Açıklama</label><input type="text" className="w-full bg-slate-950 border border-slate-800 p-3 rounded-lg text-white mt-1" value={editChannel.description} onChange={e=>setEditChannel({...editChannel, description: e.target.value})} /></div>
                
                {/* EĞER KANAL GİZLİ İSE VE KİŞİ MODERATÖR VEYA KURUCU İSE KİŞİ EKLEME ÇIKARMA YAPABİLİR */}
                {editChannel.is_private && (
                  <div className="mt-4 border-t border-slate-800 pt-4 space-y-4">
                    <h3 className="text-sm font-bold text-blue-400 flex items-center gap-2"><ShieldAlert size={16}/> Erişim & Yetki Yönetimi</h3>
                    
                    <div>
                      <label className="text-xs text-slate-500 uppercase font-bold">İzinli Kişiler (Kurucu harici)</label>
                      <select multiple className="w-full bg-slate-950 border border-slate-800 p-2 rounded-lg text-sm text-slate-300 h-24 mt-1" value={editChannel.allowed_users} onChange={e => setEditChannel({...editChannel, allowed_users: Array.from(e.target.selectedOptions, o => o.value)})}>
                        {users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
                      </select>
                    </div>

                    <div>
                      <label className="text-xs text-slate-500 uppercase font-bold">İzinli Departmanlar</label>
                      <select multiple className="w-full bg-slate-950 border border-slate-800 p-2 rounded-lg text-sm text-slate-300 h-24 mt-1" value={editChannel.allowed_departments} onChange={e => setEditChannel({...editChannel, allowed_departments: Array.from(e.target.selectedOptions, o => o.value)})}>
                        {availableDepartments.map(d => <option key={d} value={d}>{d}</option>)}
                      </select>
                    </div>

                    {/* SADECE KURUCU MODERATÖR ATAYABİLİR */}
                    {isChannelCreator() && (
                      <div className="bg-blue-500/10 p-3 rounded-lg border border-blue-500/20">
                        <label className="text-xs text-blue-400 uppercase font-bold">Moderatör Ata</label>
                        <select multiple className="w-full bg-slate-950 border border-slate-800 p-2 rounded-lg text-sm text-slate-300 h-20 mt-1" value={editChannel.moderators || []} onChange={e => setEditChannel({...editChannel, moderators: Array.from(e.target.selectedOptions, o => o.value)})}>
                          {users.filter(u => editChannel.allowed_users.includes(u.id) || editChannel.allowed_departments.includes(u.department || '')).map(u => (
                            <option key={u.id} value={u.id}>{u.full_name}</option>
                          ))}
                        </select>
                        <p className="text-[10px] text-slate-500 mt-1">Sadece bu kanala erişimi olan kişileri moderatör yapabilirsiniz.</p>
                      </div>
                    )}
                  </div>
                )}
                
                <div className="flex gap-2 pt-4 border-t border-slate-800">
                  {/* SADECE KURUCU VEYA IT SİLEBİLİR, MOD SİLEMEZ */}
                  {(isChannelCreator() || (profile?.department === 'IT & Yazılım' && !editChannel.is_private)) && (
                    <button type="button" onClick={() => handleDeleteChannel(editChannel.id)} className="flex-1 bg-red-500/10 hover:bg-red-500 border border-red-500/30 text-red-500 hover:text-white font-bold py-3 rounded-xl transition flex justify-center items-center gap-2"><Trash2 size={18}/> Sil</button>
                  )}
                  <button type="submit" className="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl transition">Güncelle</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* 3. KANAL KATILIMCILARI MODALI */}
        {showMembersModal && (
          <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-sm w-full shadow-2xl">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-bold text-white flex items-center gap-2"><Users className="text-blue-500"/> Kanal Üyeleri</h2>
                <button onClick={() => setShowMembersModal(false)} className="text-slate-500 hover:text-white"><X size={20}/></button>
              </div>
              <div className="max-h-96 overflow-y-auto space-y-3 pr-2 scrollbar-thin scrollbar-thumb-slate-800">
                {getChannelMembers().map(member => (
                  <div key={member.id} className="flex items-center gap-3 p-2 rounded-lg bg-slate-950/50 border border-slate-800/50">
                    <div className="relative shrink-0">
                      {member.avatar_url ? <img src={member.avatar_url} className="h-8 w-8 rounded-full object-cover"/> : <div className="h-8 w-8 bg-slate-800 rounded-full flex items-center justify-center"><UserIcon size={14}/></div>}
                      <div className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-slate-900 ${onlineUsers[member.id] || member.id === user?.id ? "bg-emerald-500" : "bg-slate-600"}`} />
                    </div>
                    <div className="text-left overflow-hidden flex-1">
                      <p className="font-medium text-sm text-slate-200 flex items-center gap-2 truncate">
                        <span className="truncate">{member.full_name}</span>
                        {member.id === activeTarget?.data.created_by && <span className="text-[9px] bg-yellow-500/20 text-yellow-500 px-1.5 py-0.5 rounded shrink-0">KURUCU</span>}
                        {activeTarget?.data.moderators?.includes(member.id) && <span className="text-[9px] bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded shrink-0">MOD</span>}
                      </p>
                      <p className="text-[10px] text-slate-500 truncate">{member.department} • {member.title}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {previewImage && (
          <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4 backdrop-blur-sm">
            <button onClick={() => setPreviewImage(null)} className="absolute top-6 right-6 text-white bg-slate-800 p-3 rounded-full hover:bg-red-500 transition"><X size={24} /></button>
            <img src={previewImage} className="max-w-full max-h-[90vh] rounded-lg shadow-2xl" alt="Önizleme" />
          </div>
        )}

        {/* ========================================= */}
        {/* SIDEBAR BÖLÜMÜ */}
        {/* ========================================= */}
        <div className="w-80 bg-slate-900 border-r border-slate-800 flex flex-col shrink-0">
          <div className="p-6 border-b border-slate-800 flex items-center gap-3 shrink-0">
            <div className="bg-blue-600/20 p-2 rounded-xl text-blue-500"><Building2 size={24} /></div>
            <div><h1 className="font-bold text-white tracking-tight">CorpConnect</h1><p className="text-[10px] text-blue-500 uppercase font-bold tracking-widest">Ultimate V6</p></div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-6">
            <section>
              <div className="flex items-center justify-between mb-2 px-2">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Kanallar</p>
                <button onClick={() => setShowChannelModal(true)} className="text-blue-500 hover:text-blue-400 tooltip" title="Yeni Kanal Kur"><PlusCircle size={14}/></button>
              </div>
              {channels.map(c => (
                <button key={c.id} onClick={() => setActiveTarget({type:'channel', data:c})} className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all ${activeTarget?.type === 'channel' && activeTarget.data.id === c.id ? "bg-blue-600/20 text-blue-400 border border-blue-500/20" : "hover:bg-slate-800 text-slate-400"}`}>
                  {c.is_private ? <Lock size={14} className="text-red-400"/> : <Hash size={16}/>}
                  <span className="truncate">{c.name}</span>
                </button>
              ))}
            </section>

            <section>
              <p className="text-[10px] font-bold text-slate-500 mb-2 px-2 uppercase tracking-widest">Kişiler (DM)</p>
              {users.map(u => (
                <button key={u.id} onClick={() => setActiveTarget({type:'dm', data:u})} className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all relative ${activeTarget?.type === 'dm' && activeTarget.data.id === u.id ? "bg-blue-600/20 text-blue-400 border border-blue-500/20" : "hover:bg-slate-800 text-slate-400"}`}>
                  <div className="relative shrink-0">
                    {u.avatar_url ? <img src={u.avatar_url} className="h-8 w-8 rounded-full object-cover border border-slate-700"/> : <div className="h-8 w-8 bg-slate-800 rounded-full flex items-center justify-center"><UserIcon size={14}/></div>}
                    <div className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-slate-900 ${onlineUsers[u.id] ? "bg-emerald-500" : "bg-slate-600"}`} />
                  </div>
                  <div className="text-left overflow-hidden flex-1">
                    <p className="font-medium leading-none truncate">{u.full_name}</p>
                    <p className="text-[10px] text-slate-500 mt-1 truncate">{u.department}</p>
                  </div>
                  {u.unread_count && u.unread_count > 0 ? <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center shadow-lg animate-bounce">{u.unread_count}</span> : null}
                </button>
              ))}
            </section>
          </div>

          <div className="p-4 bg-slate-950/50 border-t border-slate-800">
            <div className="flex items-center gap-3 px-2 mb-4">
              <div className="text-slate-500">{volume === 0 ? <VolumeX size={16}/> : volume < 0.5 ? <Volume1 size={16}/> : <Volume2 size={16}/>}</div>
              <input type="range" min="0" max="1" step="0.01" value={volume} onChange={(e) => setVolume(parseFloat(e.target.value))} className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-500" />
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 overflow-hidden">
                <label className="relative cursor-pointer group shrink-0">
                  {profile?.avatar_url ? <img src={profile.avatar_url} className="h-10 w-10 rounded-full object-cover border border-slate-700"/> : <div className="h-10 w-10 bg-slate-800 rounded-full flex items-center justify-center"><UserIcon size={20}/></div>}
                  <div className="absolute inset-0 bg-black/50 rounded-full opacity-0 group-hover:opacity-100 flex items-center justify-center transition text-white"><Camera size={14}/></div>
                  <input type="file" className="hidden" accept="image/*" onChange={handleAvatarUpload} />
                </label>
                <div className="truncate"><p className="text-sm font-bold text-white truncate">{profile?.full_name}</p><p className="text-[10px] text-blue-500 font-bold uppercase truncate">{profile?.department}</p></div>
              </div>
              <button onClick={() => supabase.auth.signOut()} className="text-slate-500 hover:text-red-500 p-2 shrink-0"><LogOut size={18}/></button>
            </div>
          </div>
        </div>

        {/* ========================================= */}
        {/* CHAT AREA */}
        {/* ========================================= */}
        <div className="flex-1 flex flex-col bg-slate-950 relative">
          
          <header className="h-20 border-b border-slate-800 flex items-center justify-between px-8 shrink-0 bg-slate-950/80 backdrop-blur-md absolute top-0 w-full z-10">
            {activeTarget ? (
              <>
                <div className="flex items-center gap-4">
                  {activeTarget.type === 'dm' ? (
                    <div className="relative">
                      {activeTarget.data.avatar_url ? <img src={activeTarget.data.avatar_url} className="h-10 w-10 rounded-full object-cover"/> : <div className="h-10 w-10 bg-slate-800 rounded-full flex items-center justify-center"><UserIcon size={20}/></div>}
                      <Circle size={12} className={`absolute -bottom-1 -right-1 fill-current ${onlineUsers[activeTarget.data.id] ? "text-emerald-500" : "text-slate-600"}`} />
                    </div>
                  ) : <Hash size={32} className={activeTarget.data.is_private ? "text-red-500" : "text-slate-600"} />}
                  <div>
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">{activeTarget.type === 'channel' ? activeTarget.data.name : activeTarget.data.full_name} {activeTarget.data?.is_private && <Lock size={14} className="text-red-500"/>}</h2>
                    <p className="text-xs text-slate-500 font-medium">{activeTarget.type === 'channel' ? activeTarget.data.description : `${activeTarget.data.department} • ${activeTarget.data.title}`}</p>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div className="relative w-48 lg:w-64 hidden md:block">
                    <Search className="absolute left-3 top-2.5 text-slate-500" size={16} />
                    <input type="text" placeholder="Sohbette Ara..." className="w-full bg-slate-900 border border-slate-800 text-sm text-white pl-9 pr-4 py-2 rounded-full focus:outline-none focus:border-blue-500 transition" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
                  </div>
                  
                  {activeTarget.type === 'channel' && (
                    <button onClick={() => setShowMembersModal(true)} className="p-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-blue-400 rounded-lg transition tooltip" title="Kanal Üyelerini Gör">
                      <Users size={18} />
                    </button>
                  )}

                  {/* SADECE YETKİLİLER AYARLARA GİREBİLİR */}
                  {canManageActiveChannel() && (
                    <button onClick={() => { setEditChannel(activeTarget.data); setShowSettingsModal(true); }} className="p-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-white rounded-lg transition tooltip" title="Kanal Ayarları">
                      <Settings size={18} />
                    </button>
                  )}
                </div>
              </>
            ) : (
              <div className="text-slate-500 text-sm italic">Lütfen yandaki menüden bir sohbet seçin.</div>
            )}
          </header>

          <div className="flex-1 overflow-y-auto p-8 pt-28 pb-32 space-y-6 scrollbar-thin scrollbar-thumb-slate-800">
            {filteredMessages.map(msg => {
              const isMine = msg.user_id === user?.id || msg.sender_id === user?.id;
              const originalMsg = getOriginalMessage(msg.reply_to_id);

              return (
                <div key={msg.id} className={`flex gap-4 group items-end ${isMine ? "flex-row-reverse" : ""}`}>
                  {msg.profiles?.avatar_url ? <img src={msg.profiles.avatar_url} className="h-8 w-8 rounded-full object-cover shrink-0 mb-6"/> : <div className="h-8 w-8 bg-slate-800 rounded-full flex items-center justify-center shrink-0 mb-6"><UserIcon size={16}/></div>}
                  <div className={`space-y-1 max-w-[70%] flex flex-col ${isMine ? "items-end" : "items-start"}`}>
                    <div className={`flex items-baseline gap-2 flex-wrap ${isMine ? "flex-row-reverse" : ""}`}>
                      <span className="font-bold text-slate-300 text-xs">{msg.profiles?.full_name}</span>
                      <span className="text-[9px] text-slate-600">{new Date(msg.created_at).toLocaleTimeString('tr-TR', {hour:'2-digit', minute:'2-digit'})}</span>
                      {activeTarget?.type === 'dm' && isMine && <span className={isMine ? "mr-1" : "ml-1"}>{msg.is_read ? <CheckCheck size={14} className="text-blue-500" /> : <Check size={14} className="text-slate-600" />}</span>}
                    </div>
                    <div className={`relative flex items-center gap-2 ${isMine ? "flex-row-reverse" : ""}`}>
                      <div className={`flex flex-col ${isMine ? "items-end" : "items-start"}`}>
                        {originalMsg && <div className="bg-slate-900/80 border-l-2 border-blue-500 p-2 rounded-lg rounded-b-none text-xs text-slate-400 mb-0.5 w-full line-clamp-2 italic"><span className="font-bold text-blue-400">{originalMsg.profiles.full_name}:</span> {originalMsg.content || (originalMsg.file_url ? "📷 Fotoğraf" : "🎙️ Sesli Mesaj")}</div>}
                        {msg.audio_url && <audio controls src={msg.audio_url} className={`h-10 outline-none ${isMine ? "bg-blue-600" : "bg-slate-800"} rounded-full p-1 mb-1`} />}
                        {msg.file_url && <img src={msg.file_url} onClick={() => setPreviewImage(msg.file_url!)} className="max-w-xs rounded-xl border border-slate-800 hover:scale-[1.02] transition cursor-zoom-in mb-1 mt-1" />}
                        {msg.content && <p className={`text-sm py-2 px-4 inline-block break-words max-w-full shadow-md ${isMine ? "bg-blue-600 text-white rounded-2xl rounded-tr-sm" : "bg-slate-800 text-slate-200 rounded-2xl rounded-tl-sm"}`}>{msg.content}</p>}
                        {msg.reactions && msg.reactions.length > 0 && (
                          <div className={`flex gap-1 mt-1 ${isMine ? "justify-end" : "justify-start"}`}>
                            {msg.reactions.map(r => (
                              <button key={r.emoji} onClick={() => toggleReaction(msg, r.emoji)} className={`text-[10px] bg-slate-900 border ${user && r.users.includes(user.id) ? 'border-blue-500 bg-blue-500/10' : 'border-slate-700'} px-2 py-0.5 rounded-full flex items-center gap-1 hover:bg-slate-800`}>{r.emoji} <span className="text-slate-400">{r.users.length}</span></button>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className={`opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-all bg-slate-900 border border-slate-800 rounded-full p-1 shadow-lg ${isMine ? "-mr-2" : "-ml-2"}`}>
                        <button onClick={() => toggleReaction(msg, '👍')} className="p-1.5 hover:bg-slate-800 rounded-full text-slate-400 hover:text-yellow-400"><SmilePlus size={14} /></button>
                        <button onClick={() => setReplyingTo(msg)} className="p-1.5 hover:bg-slate-800 rounded-full text-slate-400 hover:text-blue-400"><Reply size={14} /></button>
                        {isMine && <button onClick={() => deleteMessage(msg.id)} className="p-1.5 hover:bg-slate-800 rounded-full text-slate-400 hover:text-red-500"><Trash2 size={14} /></button>}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          <footer className="absolute bottom-0 w-full p-4 md:p-6 bg-slate-950 border-t border-slate-900 z-10 shadow-[0_-10px_40px_rgba(2,8,23,0.8)]">
            {typingUsers.length > 0 && <div className="absolute -top-6 left-8 text-[10px] text-blue-400 font-medium italic animate-pulse flex items-center gap-1"><span className="flex gap-0.5"><span className="w-1 h-1 bg-blue-400 rounded-full animate-bounce"/> <span className="w-1 h-1 bg-blue-400 rounded-full animate-bounce" style={{animationDelay: "0.1s"}}/> <span className="w-1 h-1 bg-blue-400 rounded-full animate-bounce" style={{animationDelay: "0.2s"}}/></span>{typingUsers.join(", ")} yazıyor...</div>}
            {replyingTo && <div className="mb-2 bg-slate-900 border-l-4 border-blue-500 p-3 rounded-lg flex justify-between items-center w-full max-w-4xl mx-auto"><div className="truncate text-xs text-slate-400"><span className="font-bold text-blue-400">{replyingTo.profiles.full_name}</span> adlı kişiye yanıt veriliyor:<br/><span className="italic">{replyingTo.content || "Medya"}</span></div><button onClick={() => setReplyingTo(null)} className="text-slate-500 hover:text-red-400"><X size={16}/></button></div>}
            {file && <div className="mb-3 flex items-center gap-2 bg-blue-500/10 text-blue-400 px-3 py-1.5 rounded-lg border border-blue-500/20 w-fit text-xs max-w-4xl mx-auto"><ImageIcon size={14}/> {file.name} <button onClick={()=>setFile(null)}><X size={14}/></button></div>}
            
            <form onSubmit={sendMessage} className="relative flex items-center gap-2 w-full max-w-4xl mx-auto">
              <div className="flex-1 relative flex items-center">
                <label className="absolute left-4 cursor-pointer text-slate-500 hover:text-blue-500 transition"><Paperclip size={20}/><input disabled={!activeTarget} type="file" className="hidden" accept="image/*" onChange={e => setFile(e.target.files![0])} /></label>
                {isRecording ? <div className="w-full bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl pl-14 pr-12 py-4 flex items-center justify-between animate-pulse font-mono font-bold"><span>🎙️ Kaydediliyor...</span> <span>{formatTime(recordingTime)}</span></div> : <input disabled={!activeTarget} type="text" placeholder={activeTarget ? "Mesaj yazın..." : "Sohbet seçin..."} className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-14 pr-14 py-4 focus:outline-none focus:border-blue-500/50 text-white disabled:opacity-50" value={newMessage} onChange={handleTyping} />}
                {newMessage.trim() || file ? <button type="submit" disabled={isSending} className="absolute right-3 p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500 disabled:opacity-50"><Send size={18}/></button> : <button disabled={!activeTarget} type="button" onClick={isRecording ? stopRecording : startRecording} className={`absolute right-3 p-2 rounded-lg transition-all disabled:opacity-50 ${isRecording ? 'bg-red-500 text-white animate-pulse' : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'}`}>{isRecording ? <Square size={18}/> : <Mic size={18}/>}</button>}
              </div>
            </form>
          </footer>
        </div>
      </div>
    );
  }

  // =========================================
  // GİRİŞ EKRANI
  // =========================================
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-slate-900 rounded-3xl border border-slate-800 p-10 shadow-2xl">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-blue-600/10 text-blue-500 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-blue-500/20"><Building2 size={32}/></div>
          <h1 className="text-2xl font-bold text-white">CorpConnect</h1>
          <p className="text-slate-500 text-sm mt-1">{isLogin ? "Sisteme Giriş Yapın" : "Yeni Personel Kaydı"}</p>
        </div>
        {errorMsg && <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm font-medium text-center">{errorMsg}</div>}
        <form onSubmit={isLogin ? handleLogin : handleRegister} className="space-y-4">
          {!isLogin && (
            <>
              <div className="relative"><UserIcon className="absolute left-4 top-4 text-slate-500" size={18} /><input required type="text" placeholder="Adınız Soyadınız" className="w-full bg-slate-950 border border-slate-800 text-white pl-12 pr-4 py-4 rounded-xl focus:outline-none focus:border-blue-500" value={fullName} onChange={(e) => setFullName(e.target.value)} /></div>
              <div className="relative"><Key className="absolute left-4 top-4 text-blue-500" size={18} /><input required type="text" placeholder="Davet Kodu" className="w-full bg-blue-950/20 border border-blue-500/30 text-blue-100 pl-12 pr-4 py-4 rounded-xl focus:outline-none focus:border-blue-500" value={inviteKey} onChange={(e) => setInviteKey(e.target.value)} /></div>
            </>
          )}
          <div className="relative"><Mail className="absolute left-4 top-4 text-slate-500" size={18} /><input required type="email" placeholder="E-posta" className="w-full bg-slate-950 border border-slate-800 text-white pl-12 pr-4 py-4 rounded-xl focus:outline-none focus:border-blue-500" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <div className="relative"><Lock className="absolute left-4 top-4 text-slate-500" size={18} /><input required type="password" placeholder="Parola" className="w-full bg-slate-950 border border-slate-800 text-white pl-12 pr-4 py-4 rounded-xl focus:outline-none focus:border-blue-500" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
          <button type="submit" disabled={isLoading} className="w-full bg-blue-600 text-white font-bold py-4 rounded-xl hover:bg-blue-500 transition disabled:opacity-50">{isLoading ? "İşleniyor..." : (isLogin ? "Giriş Yap" : "Kayıt Ol")}</button>
        </form>
        <button onClick={() => setIsLogin(!isLogin)} className="w-full mt-6 text-slate-500 text-sm hover:text-white transition">{isLogin ? "Hesabınız yok mu? Kayıt olun" : "Zaten hesabınız var mı? Giriş yapın"}</button>
      </div>
    </div>
  );
}