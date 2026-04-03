"use client";
import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase";
import { User } from "@supabase/supabase-js";
import { ShieldAlert, Key, Plus, RefreshCw, ArrowLeft, Building2, UserPlus, Trash2, User as UserIcon } from "lucide-react";
import Link from "next/link";

type InviteKey = { id: string; key_code: string; title_name: string; department: string; is_used: boolean; created_at: string };

export default function AdminPanel() {
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [keys, setKeys] = useState<InviteKey[]>([]);
  
  // Form States
  const [keyCode, setKeyCode] = useState("");
  const [titleName, setTitleName] = useState("");
  const [department, setDepartment] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [msg, setMsg] = useState({ text: "", type: "" });

  useEffect(() => {
    checkAdminAccess();
  }, []);

  const checkAdminAccess = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setIsAdmin(false);
      return;
    }
    setUser(session.user);

    // Güvenlik Kontrolü: Yönetim Kurulu VEYA IT & Yazılım departmanında mı?
    const { data: profile } = await supabase.from("profiles").select("department").eq("id", session.user.id).single();
    
    if (profile?.department === 'Yönetim Kurulu' || profile?.department === 'IT & Yazılım') {
      setIsAdmin(true);
      fetchKeys(); // Adminse anahtarları getir
    } else {
      setIsAdmin(false); // Değilse kapı dışarı
    }
  };

  const fetchKeys = async () => {
    const { data } = await supabase.from("invite_keys").select("*").order("created_at", { ascending: false });
    if (data) setKeys(data);
  };

  const generateKey = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsGenerating(true);
    setMsg({ text: "", type: "" });

    const newKey = keyCode.trim().toUpperCase();

    const { error } = await supabase.from("invite_keys").insert([{
      key_code: newKey,
      title_name: titleName,
      department: department
    }]);

    if (error) {
      setMsg({ text: "Hata! Bu kod zaten var olabilir.", type: "error" });
    } else {
      setMsg({ text: "Harika! Yeni personel kodu üretildi.", type: "success" });
      setKeyCode(""); setTitleName(""); setDepartment("");
      fetchKeys(); // Listeyi yenile
    }
    setIsGenerating(false);
  };

  const toggleKeyStatus = async (id: string, currentStatus: boolean) => {
    await supabase.from("invite_keys").update({ is_used: !currentStatus }).eq("id", id);
    fetchKeys();
  };

  const deleteKey = async (id: string) => {
    if(confirm("Bu davet kodunu tamamen silmek istediğinize emin misiniz?")) {
      await supabase.from("invite_keys").delete().eq("id", id);
      fetchKeys();
    }
  };

  // 🛑 YETKİSİZ ERİŞİM EKRANI
  if (isAdmin === false) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-white p-4">
        <ShieldAlert size={64} className="text-red-500 mb-6 animate-pulse" />
        <h1 className="text-3xl font-bold mb-2">Erişim Reddedildi</h1>
        <p className="text-slate-400 mb-8 text-center max-w-md">
          Bu alana sadece <strong className="text-white">Yönetim Kurulu</strong> ve <strong className="text-white">IT Departmanı</strong> erişebilir.
        </p>
        <Link href="/" className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 px-6 py-3 rounded-lg transition">
          <ArrowLeft size={18} /> Ana Sisteme Dön
        </Link>
      </div>
    );
  }

  // ⏳ YÜKLENİYOR EKRANI
  if (isAdmin === null) return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-blue-500 font-mono">YETKİLER KONTROL EDİLİYOR...</div>;

  // 👑 ADMİN PANELİ (GÜVENLİ BÖLGE)
  return (
    <div className="min-h-screen bg-slate-950 text-slate-300 p-8 font-sans">
      
      {/* Üst Bilgi */}
      <header className="max-w-6xl mx-auto flex items-center justify-between mb-12">
        <div className="flex items-center gap-4">
          <div className="bg-red-500/10 p-3 rounded-2xl text-red-500 border border-red-500/20">
            <ShieldAlert size={32} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Sistem Yönetimi</h1>
            <p className="text-sm text-slate-500">CorpConnect Yönetim Paneli</p>
          </div>
        </div>
        <Link href="/" className="flex items-center gap-2 bg-slate-900 border border-slate-800 hover:bg-slate-800 px-5 py-2.5 rounded-xl transition text-sm font-medium">
          <ArrowLeft size={16} /> Uygulamaya Dön
        </Link>
      </header>

      <main className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* SOL: YENİ KOD ÜRETME FORMU */}
        <div className="lg:col-span-1">
          <div className="bg-slate-900 rounded-3xl border border-slate-800 p-8 shadow-2xl sticky top-8">
            <div className="flex items-center gap-3 mb-6">
              <UserPlus className="text-blue-500" size={24} />
              <h2 className="text-lg font-bold text-white">Yeni Personel Ekle</h2>
            </div>

            {msg.text && (
              <div className={`mb-6 p-4 rounded-xl text-sm font-medium border ${msg.type === 'error' ? 'bg-red-500/10 text-red-400 border-red-500/20' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'}`}>
                {msg.text}
              </div>
            )}

            <form onSubmit={generateKey} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Departman</label>
                <div className="relative">
                  <Building2 className="absolute left-4 top-3.5 text-slate-600" size={18} />
                  <input required type="text" placeholder="Örn: Pazarlama" className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-12 pr-4 py-3 text-white focus:border-blue-500 outline-none transition" value={department} onChange={e => setDepartment(e.target.value)} />
                </div>
              </div>
              
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Unvan</label>
                <div className="relative">
                  <UserIcon className="absolute left-4 top-3.5 text-slate-600" size={18} />
                  <input required type="text" placeholder="Örn: Sosyal Medya Uzmanı" className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-12 pr-4 py-3 text-white focus:border-blue-500 outline-none transition" value={titleName} onChange={e => setTitleName(e.target.value)} />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Giriş Anahtarı</label>
                <div className="relative">
                  <Key className="absolute left-4 top-3.5 text-blue-500" size={18} />
                  <input required type="text" placeholder="Örn: REKLAM-505" className="w-full bg-blue-950/20 border border-blue-500/30 rounded-xl pl-12 pr-4 py-3 text-blue-100 placeholder:text-blue-700 focus:border-blue-500 outline-none transition uppercase" value={keyCode} onChange={e => setKeyCode(e.target.value)} />
                </div>
              </div>

              <button type="submit" disabled={isGenerating} className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 rounded-xl transition-all flex items-center justify-center gap-2 mt-4 disabled:opacity-50">
                {isGenerating ? "Üretiliyor..." : <><Plus size={18} /> Kodu Üret</>}
              </button>
            </form>
          </div>
        </div>

        {/* SAĞ: MEVCUT ANAHTARLAR LİSTESİ */}
        <div className="lg:col-span-2">
          <div className="bg-slate-900 rounded-3xl border border-slate-800 overflow-hidden shadow-2xl">
            <div className="p-8 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-white">Aktif ve Kullanılmış Kodlar</h2>
                <p className="text-sm text-slate-500">Sisteme giriş yapabilecek veya yapmış personeller.</p>
              </div>
              <div className="bg-slate-950 text-slate-400 px-4 py-2 rounded-lg text-sm font-bold border border-slate-800">
                Toplam: {keys.length}
              </div>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-950/50 text-[10px] uppercase tracking-widest text-slate-500">
                    <th className="p-4 font-bold border-b border-slate-800">Davet Kodu</th>
                    <th className="p-4 font-bold border-b border-slate-800">Departman / Unvan</th>
                    <th className="p-4 font-bold border-b border-slate-800">Durum</th>
                    <th className="p-4 font-bold border-b border-slate-800 text-right">İşlem</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {keys.map((k) => (
                    <tr key={k.id} className="hover:bg-slate-800/30 transition">
                      <td className="p-4 font-mono font-bold text-white">{k.key_code}</td>
                      <td className="p-4">
                        <div className="text-sm font-bold text-slate-300">{k.department}</div>
                        <div className="text-xs text-slate-500">{k.title_name}</div>
                      </td>
                      <td className="p-4">
                        {k.is_used ? (
                          <span className="bg-red-500/10 text-red-400 border border-red-500/20 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider">Kullanıldı</span>
                        ) : (
                          <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider">Bekliyor</span>
                        )}
                      </td>
                      <td className="p-4 flex items-center justify-end gap-2">
                        {k.is_used && (
                          <button onClick={() => toggleKeyStatus(k.id, k.is_used)} className="p-2 bg-slate-800 hover:bg-blue-600 text-slate-400 hover:text-white rounded-lg transition tooltip" title="Kodu Tekrar Aktif Et">
                            <RefreshCw size={16} />
                          </button>
                        )}
                        <button onClick={() => deleteKey(k.id)} className="p-2 bg-slate-800 hover:bg-red-600 text-slate-400 hover:text-white rounded-lg transition">
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {keys.length === 0 && (
                    <tr>
                      <td colSpan={4} className="p-8 text-center text-slate-500">Sistemde henüz bir davet kodu yok.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

      </main>
    </div>
  );
}