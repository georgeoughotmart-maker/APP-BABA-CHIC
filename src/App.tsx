/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, ErrorInfo, ReactNode } from 'react';
import { 
  Plus, 
  Trophy, 
  User, 
  Camera, 
  DollarSign, 
  Goal, 
  Star, 
  Trash2, 
  ChevronLeft, 
  ChevronRight,
  Medal,
  Crown,
  CheckCircle2,
  XCircle,
  Lock,
  Unlock,
  Settings,
  LogOut,
  AlertCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Player } from './types';
import { 
  collection, 
  onSnapshot, 
  doc, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  getDocFromServer,
  query,
  orderBy
} from 'firebase/firestore';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut,
  User as FirebaseUser
} from 'firebase/auth';
import { db, auth } from './firebase';

const ADMIN_EMAIL = "georgeoughotmart@gmail.com";

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}


export default function AppWrapper() {
  return <App />;
}

function App() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [isAddingPlayer, setIsAddingPlayer] = useState(false);
  const [isSettingPOW, setIsSettingPOW] = useState(false);
  const [selectedPOWId, setSelectedPOWId] = useState<string | null>(null);
  const [powPhoto, setPowPhoto] = useState<string | undefined>(undefined);
  const [newPlayerName, setNewPlayerName] = useState('');
  const [newPlayerPhoto, setNewPlayerPhoto] = useState<string | undefined>(undefined);
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const powFileInputRef = useRef<HTMLInputElement>(null);

  // Test connection
  useEffect(() => {
    async function testConnection() {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if(error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration.");
        }
      }
    }
    testConnection();
  }, []);

  // Check session for admin
  useEffect(() => {
    const wasAdmin = sessionStorage.getItem('is_baba_admin') === 'true';
    if (wasAdmin) setIsAdmin(true);
  }, []);

  // Firestore Listener
  useEffect(() => {
    const q = query(collection(db, 'players'), orderBy('goals', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const playersData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Player[];
      setPlayers(playersData);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'players');
    });
    return () => unsubscribe();
  }, []);

  const handleAdminLogin = () => {
    if (adminPassword === 'baba123') {
      setIsAdmin(true);
      sessionStorage.setItem('is_baba_admin', 'true');
      setShowAdminLogin(false);
      setAdminPassword('');
    } else {
      alert('Senha incorreta!');
    }
  };

  const handleLogout = () => {
    setIsAdmin(false);
    sessionStorage.removeItem('is_baba_admin');
  };

  const addPlayer = async () => {
    if (!isAdmin) return;
    if (!newPlayerName.trim()) return;
    
    const newPlayerData = {
      name: newPlayerName,
      photo: newPlayerPhoto || null,
      goals: 0,
      isPlayerOfWeek: false,
      playerOfWeekCount: 0,
      payments: {}
    };
    
    try {
      const newDocRef = doc(collection(db, 'players'));
      await setDoc(newDocRef, newPlayerData);
      setNewPlayerName('');
      setNewPlayerPhoto(undefined);
      setIsAddingPlayer(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'players');
    }
  };

  const deletePlayer = async (id: string) => {
    if (!isAdmin) return;
    if (confirm('Remover este craque do time?')) {
      try {
        await deleteDoc(doc(db, 'players', id));
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, `players/${id}`);
      }
    }
  };

  const togglePayment = async (playerId: string) => {
    if (!isAdmin) return;
    const player = players.find(p => p.id === playerId);
    if (!player) return;

    const currentStatus = player.payments[currentMonth];
    let nextStatus: boolean | 'exempt';

    if (currentStatus === true) {
      nextStatus = 'exempt';
    } else if (currentStatus === 'exempt') {
      nextStatus = false;
    } else {
      nextStatus = true;
    }

    try {
      await updateDoc(doc(db, 'players', playerId), {
        [`payments.${currentMonth}`]: nextStatus
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `players/${playerId}`);
    }
  };

  const updateGoals = async (playerId: string, delta: number) => {
    if (!isAdmin) return;
    const player = players.find(p => p.id === playerId);
    if (!player) return;

    try {
      await updateDoc(doc(db, 'players', playerId), {
        goals: Math.max(0, player.goals + delta)
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `players/${playerId}`);
    }
  };

  const setPlayerOfWeek = async (playerId: string) => {
    if (!isAdmin) return;
    
    const player = players.find(p => p.id === playerId);
    if (!player) return;

    // If already POW, just unset
    if (player.isPlayerOfWeek) {
      try {
        await updateDoc(doc(db, 'players', playerId), { isPlayerOfWeek: false });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `players/${playerId}`);
      }
      return;
    }

    // If not POW, open modal to set
    setSelectedPOWId(playerId);
    setPowPhoto(undefined);
    setIsSettingPOW(true);
  };

  const confirmPlayerOfWeek = async () => {
    if (!isAdmin || !selectedPOWId) return;
    
    try {
      // 1. Unset current POW
      const currentPOW = players.find(p => p.isPlayerOfWeek);
      if (currentPOW) {
        await updateDoc(doc(db, 'players', currentPOW.id), { isPlayerOfWeek: false });
      }
      
      // 2. Set new POW and increment count
      const player = players.find(p => p.id === selectedPOWId);
      if (player) {
        await updateDoc(doc(db, 'players', selectedPOWId), { 
          isPlayerOfWeek: true,
          playerOfWeekCount: (player.playerOfWeekCount || 0) + 1,
          playerOfWeekPhoto: powPhoto || null
        });
      }
      
      setIsSettingPOW(false);
      setSelectedPOWId(null);
      setPowPhoto(undefined);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'players');
    }
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>, type: 'player' | 'pow') => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (type === 'player') setNewPlayerPhoto(reader.result as string);
        else setPowPhoto(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const changeMonth = (delta: number) => {
    const [year, month] = currentMonth.split('-').map(Number);
    const date = new Date(year, month - 1 + delta, 1);
    setCurrentMonth(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`);
  };

  const sortedScorers = [...players].sort((a, b) => {
    if (b.goals !== a.goals) return b.goals - a.goals;
    if ((b.playerOfWeekCount || 0) !== (a.playerOfWeekCount || 0)) {
      return (b.playerOfWeekCount || 0) - (a.playerOfWeekCount || 0);
    }
    return a.name.localeCompare(b.name);
  });
  const top3 = sortedScorers.slice(0, 3);
  const craqueDaSemana = players.find(p => p.isPlayerOfWeek);

  const monthNames = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
  ];

  const formatMonth = (monthStr: string) => {
    const [year, month] = monthStr.split('-');
    return `${monthNames[parseInt(month) - 1]} ${year}`;
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-white font-sans pb-24">
      {/* Header Estilo Placar */}
      <header className="bg-emerald-900/80 backdrop-blur-md border-b border-white/10 sticky top-0 z-40 px-6 py-4 shadow-2xl">
        <div className="max-w-5xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="bg-white text-emerald-900 p-2 rounded-xl rotate-3 shadow-lg">
              <Goal size={28} strokeWidth={2.5} />
            </div>
            <div>
              <h1 className="text-xl font-black uppercase tracking-tighter italic leading-none">
                BABA CHIC
              </h1>
              <div className="flex items-center gap-2">
                <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-emerald-400">Arena AI Studio</p>
                {isAdmin && (
                  <div className="flex flex-col items-end">
                    <span className="bg-amber-400 text-amber-950 text-[8px] font-black px-1.5 rounded uppercase">Modo ADM</span>
                  </div>
                )}
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            {isAdmin ? (
              <>
                <button 
                  onClick={() => setIsAddingPlayer(true)}
                  className="bg-white text-emerald-900 hover:scale-105 active:scale-95 px-4 py-2 rounded-xl font-black uppercase text-xs transition-all shadow-[0_4px_0_rgb(200,200,200)] flex items-center gap-2"
                >
                  <Plus size={16} strokeWidth={3} /> Contratar
                </button>
                <button 
                  onClick={handleLogout}
                  className="bg-red-500/20 text-red-400 p-2 rounded-xl border border-red-500/30 hover:bg-red-500/30 transition-all"
                  title="Sair do Modo ADM"
                >
                  <LogOut size={20} />
                </button>
              </>
            ) : (
              <button 
                onClick={() => setShowAdminLogin(true)}
                className="bg-white/5 text-white/60 hover:text-white hover:bg-white/10 p-2 rounded-xl border border-white/10 transition-all flex items-center gap-2 text-xs font-bold uppercase"
              >
                <Lock size={16} /> ADM
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-12">
        {!isAdmin && (
          <div className="bg-amber-400/10 border border-amber-400/20 rounded-2xl p-4 flex items-center gap-3 text-amber-200 text-sm font-medium">
            <Lock size={18} className="shrink-0" />
            <p>Você está no modo visualização. Apenas o administrador pode alterar dados.</p>
          </div>
        )}
        
        {/* SEÇÃO DE DESTAQUES (PODIOS) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* PODIO VISUAL ARTILHEIROS */}
          <section className="lg:col-span-7 bg-white/5 rounded-[2.5rem] p-8 border border-white/10 relative overflow-hidden grass-pattern">
            <div className="flex items-center justify-between mb-12">
              <h2 className="text-2xl font-black uppercase italic flex items-center gap-3">
                <Trophy className="text-amber-400" size={32} /> Artilharia
              </h2>
            </div>

            <div className="flex items-end justify-center gap-2 sm:gap-4 h-64 mt-10">
              {/* 2º Lugar */}
              {top3[1] && (
                <div className="flex flex-col items-center group">
                  <div className="mb-4 relative">
                    <img 
                      src={top3[1].photo || `https://picsum.photos/seed/${top3[1].id}/200`} 
                      className="w-16 h-16 rounded-full border-4 border-slate-400 object-cover shadow-xl group-hover:scale-110 transition-transform" 
                      referrerPolicy="no-referrer"
                    />
                    <div className="absolute -bottom-2 -right-2 bg-slate-400 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">2º</div>
                  </div>
                  <div className="w-20 sm:w-28 bg-slate-400/30 border-t-4 border-slate-400 h-24 rounded-t-2xl flex flex-col items-center justify-center p-2 text-center">
                    <span className="text-[10px] font-bold uppercase truncate w-full">{top3[1].name}</span>
                    <span className="text-lg font-black">{top3[1].goals}</span>
                  </div>
                </div>
              )}

              {/* 1º Lugar */}
              {top3[0] && (
                <div className="flex flex-col items-center group -translate-y-4">
                  <div className="mb-4 relative">
                    <Crown className="absolute -top-8 left-1/2 -translate-x-1/2 text-amber-400 animate-bounce" size={32} fill="currentColor" />
                    <img 
                      src={top3[0].photo || `https://picsum.photos/seed/${top3[0].id}/200`} 
                      className="w-24 h-24 rounded-full border-4 border-amber-400 object-cover shadow-[0_0_30px_rgba(251,191,36,0.3)] group-hover:scale-110 transition-transform" 
                      referrerPolicy="no-referrer"
                    />
                    <div className="absolute -bottom-2 -right-2 bg-amber-400 text-white text-xs font-bold px-3 py-1 rounded-full">1º</div>
                  </div>
                  <div className="w-24 sm:w-32 bg-amber-400/30 border-t-4 border-amber-400 h-32 rounded-t-2xl flex flex-col items-center justify-center p-2 text-center">
                    <span className="text-xs font-bold uppercase truncate w-full">{top3[0].name}</span>
                    <span className="text-2xl font-black">{top3[0].goals}</span>
                  </div>
                </div>
              )}

              {/* 3º Lugar */}
              {top3[2] && (
                <div className="flex flex-col items-center group">
                  <div className="mb-4 relative">
                    <img 
                      src={top3[2].photo || `https://picsum.photos/seed/${top3[2].id}/200`} 
                      className="w-16 h-16 rounded-full border-4 border-orange-600 object-cover shadow-xl group-hover:scale-110 transition-transform" 
                      referrerPolicy="no-referrer"
                    />
                    <div className="absolute -bottom-2 -right-2 bg-orange-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">3º</div>
                  </div>
                  <div className="w-20 sm:w-28 bg-orange-600/30 border-t-4 border-orange-600 h-20 rounded-t-2xl flex flex-col items-center justify-center p-2 text-center">
                    <span className="text-[10px] font-bold uppercase truncate w-full">{top3[2].name}</span>
                    <span className="text-lg font-black">{top3[2].goals}</span>
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* CRAQUE DA SEMANA (ESTILO CARD FIFA) */}
          <section className="lg:col-span-5 flex flex-col items-center justify-center">
            <h2 className="text-sm font-black uppercase tracking-[0.3em] text-emerald-400 mb-6 text-center">Craque da Semana</h2>
            
            <AnimatePresence mode="wait">
              {craqueDaSemana ? (
                <motion.div 
                  key={craqueDaSemana.id}
                  initial={{ rotateY: 90, opacity: 0 }}
                  animate={{ rotateY: 0, opacity: 1 }}
                  exit={{ rotateY: -90, opacity: 0 }}
                  className="relative w-64 h-80 bg-gradient-to-b from-amber-400 to-amber-600 rounded-[2rem] p-1 shadow-[0_20px_50px_rgba(251,191,36,0.4)] group cursor-pointer"
                >
                  <div className="absolute inset-0 bg-black/10 rounded-[2rem] m-1 overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-full bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-20" />
                    
                    {/* Card Content */}
                    <div className="relative h-full flex flex-col items-center pt-8 px-4">
                      <div className="absolute top-4 left-4 flex flex-col items-center">
                        <span className="text-3xl font-black leading-none">99</span>
                        <span className="text-[10px] font-bold uppercase">OVR</span>
                        <div className="w-6 h-0.5 bg-white/50 my-1" />
                        <Star size={14} fill="white" />
                      </div>

                      <img 
                        src={craqueDaSemana.playerOfWeekPhoto || craqueDaSemana.photo || `https://picsum.photos/seed/${craqueDaSemana.id}/400`} 
                        className="w-40 h-40 object-cover rounded-full border-4 border-white/20 shadow-2xl mb-4" 
                        referrerPolicy="no-referrer"
                      />
                      
                      <h3 className="text-xl font-black uppercase italic tracking-tighter text-center leading-none mb-1">
                        {craqueDaSemana.name}
                      </h3>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-white/70">Melhor do Baba</p>
                      
                      <div className="mt-auto mb-6 flex gap-4 text-center">
                        <div>
                          <p className="text-[8px] font-bold uppercase text-white/60">Gols</p>
                          <p className="text-sm font-black">{craqueDaSemana.goals}</p>
                        </div>
                        <div className="w-px h-6 bg-white/20" />
                        <div>
                          <p className="text-[8px] font-bold uppercase text-white/60">Títulos</p>
                          <p className="text-sm font-black">{craqueDaSemana.playerOfWeekCount || 0}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ) : (
                <div className="w-64 h-80 border-4 border-dashed border-white/10 rounded-[2rem] flex flex-col items-center justify-center text-white/20">
                  <Medal size={64} strokeWidth={1} />
                  <p className="text-xs font-bold uppercase mt-4">Vaga em aberto</p>
                </div>
              )}
            </AnimatePresence>
          </section>
        </div>

        {/* LISTA GERAL DE ATLETAS */}
        <section className="bg-white/5 rounded-[2.5rem] p-8 border border-white/10">
          <h2 className="text-2xl font-black uppercase italic flex items-center gap-3 mb-10">
            <User className="text-blue-400" size={32} /> Elenco ({players.length})
          </h2>

          <div className="space-y-4">
            {players.map(player => (
              <div key={player.id} className="bg-black/40 rounded-3xl p-4 border border-white/5 flex flex-col sm:flex-row items-center sm:justify-between gap-4 sm:gap-6 group hover:border-white/20 transition-all">
                <div className="flex items-center gap-4 sm:gap-6 w-full sm:w-auto">
                  <div className="relative flex-shrink-0">
                    <img 
                      src={player.photo || `https://picsum.photos/seed/${player.id}/200`} 
                      className="w-16 h-16 sm:w-20 sm:h-20 rounded-[1.2rem] sm:rounded-[1.5rem] object-cover border-2 border-white/10" 
                      referrerPolicy="no-referrer"
                    />
                    {player.isPlayerOfWeek && (
                      <div className="absolute -top-2 -right-2 sm:-top-3 sm:-right-3 bg-amber-400 p-1.5 sm:p-2 rounded-full shadow-lg border-2 sm:border-4 border-neutral-900">
                        <Star size={12} fill="white" className="text-white sm:w-4 sm:h-4" />
                      </div>
                    )}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg sm:text-xl font-black uppercase italic tracking-tighter truncate">{player.name}</h3>
                    <div className="flex flex-wrap items-center gap-2 sm:gap-4 mt-2">
                      <div className="bg-emerald-500/20 text-emerald-400 px-2 sm:px-3 py-1 rounded-full text-[9px] sm:text-[10px] font-black uppercase flex items-center gap-1">
                        <Goal size={10} className="sm:w-3 sm:h-3" /> {player.goals} Gols
                      </div>
                      <div className="bg-amber-500/20 text-amber-400 px-2 sm:px-3 py-1 rounded-full text-[9px] sm:text-[10px] font-black uppercase flex items-center gap-1">
                        <Medal size={10} className="sm:w-3 sm:h-3" /> {player.playerOfWeekCount || 0} Títulos
                      </div>
                      <div className={`px-2 sm:px-3 py-1 rounded-full text-[9px] sm:text-[10px] font-black uppercase ${
                        player.payments[currentMonth] === true 
                        ? 'bg-blue-500/20 text-blue-400' 
                        : player.payments[currentMonth] === 'exempt'
                        ? 'bg-purple-500/20 text-purple-400'
                        : 'bg-red-500/20 text-red-400'
                      }`}>
                        {player.payments[currentMonth] === true ? 'Em dia' : player.payments[currentMonth] === 'exempt' ? 'Isento' : 'Em débito'}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto justify-between sm:justify-end border-t border-white/5 sm:border-none pt-3 sm:pt-0">
                  <div className={`flex items-center bg-white/5 rounded-2xl p-1 border border-white/10 ${!isAdmin && 'opacity-50'}`}>
                    <button 
                      onClick={() => updateGoals(player.id, -1)} 
                      disabled={!isAdmin}
                      className="w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center hover:bg-white/10 rounded-xl transition-colors font-black text-lg sm:text-xl disabled:cursor-not-allowed"
                    >-</button>
                    <span className="w-10 sm:w-12 text-center font-black text-lg sm:text-xl italic">{player.goals}</span>
                    <button 
                      onClick={() => updateGoals(player.id, 1)} 
                      disabled={!isAdmin}
                      className="w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center hover:bg-white/10 rounded-xl transition-colors font-black text-lg sm:text-xl disabled:cursor-not-allowed"
                    >+</button>
                  </div>

                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => setPlayerOfWeek(player.id)}
                      disabled={!isAdmin}
                      className={`p-3 sm:p-4 rounded-2xl transition-all ${
                        player.isPlayerOfWeek 
                        ? 'bg-amber-400 text-white shadow-lg' 
                        : 'bg-white/5 text-white/20 hover:text-amber-400 hover:bg-white/10'
                      } ${!isAdmin && 'opacity-50 cursor-not-allowed'}`}
                      title="Melhor da Semana"
                    >
                      <Medal size={20} sm:size={24} strokeWidth={2.5} />
                    </button>

                    {isAdmin && (
                      <button 
                        onClick={() => deletePlayer(player.id)}
                        className="p-3 sm:p-4 rounded-2xl bg-white/5 text-white/20 hover:bg-red-500/20 hover:text-red-500 transition-all"
                      >
                        <Trash2 size={20} sm:size={24} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
            
            {players.length === 0 && (
              <div className="text-center py-20 border-2 border-dashed border-white/5 rounded-[2.5rem]">
                <User size={48} className="mx-auto text-white/10 mb-4" />
                <p className="text-white/30 font-bold uppercase tracking-widest text-sm">Nenhum atleta no elenco</p>
              </div>
            )}
          </div>
        </section>

        {/* CONTROLE DE MENSALIDADE */}
        <section className="bg-white/5 rounded-[2.5rem] p-8 border border-white/10">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-6 mb-10">
            <h2 className="text-2xl font-black uppercase italic flex items-center gap-3">
              <DollarSign className="text-emerald-400" size={32} /> Mensalidades
            </h2>
            
            <div className="flex items-center gap-4 bg-black/40 p-2 rounded-2xl border border-white/5">
              <button onClick={() => changeMonth(-1)} className="p-2 hover:bg-white/10 rounded-xl transition-colors"><ChevronLeft size={20} /></button>
              <div className="text-center min-w-[140px]">
                <p className="text-[10px] font-bold uppercase text-emerald-400 tracking-widest">Mês de Referência</p>
                <span className="text-sm font-black uppercase italic">{formatMonth(currentMonth)}</span>
              </div>
              <button onClick={() => changeMonth(1)} className="p-2 hover:bg-white/10 rounded-xl transition-colors"><ChevronRight size={20} /></button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {players.map(player => (
              <motion.div 
                key={player.id}
                layout
                className={`flex items-center justify-between p-4 rounded-3xl border transition-all ${
                  player.payments[currentMonth] === true 
                  ? 'bg-emerald-500/10 border-emerald-500/30' 
                  : player.payments[currentMonth] === 'exempt'
                  ? 'bg-purple-500/10 border-purple-500/30'
                  : 'bg-white/5 border-white/10'
                }`}
              >
                <div className="flex items-center gap-4">
                  <img 
                    src={player.photo || `https://picsum.photos/seed/${player.id}/100`} 
                    className="w-12 h-12 rounded-2xl object-cover border border-white/10" 
                    referrerPolicy="no-referrer"
                  />
                  <div>
                    <h4 className="font-black uppercase text-xs italic">{player.name}</h4>
                    <p className={`text-[10px] font-bold uppercase ${
                      player.payments[currentMonth] === true 
                      ? 'text-emerald-400' 
                      : player.payments[currentMonth] === 'exempt'
                      ? 'text-purple-400'
                      : 'text-red-400'
                    }`}>
                      {player.payments[currentMonth] === true ? 'Pagamento Confirmado' : player.payments[currentMonth] === 'exempt' ? 'Isento (Machucado)' : 'Aguardando'}
                    </p>
                  </div>
                </div>
                
                <button 
                  onClick={() => togglePayment(player.id)}
                  disabled={!isAdmin}
                  className={`p-3 rounded-2xl transition-all ${
                    player.payments[currentMonth] === true 
                    ? 'bg-emerald-500 text-white shadow-[0_0_20px_rgba(16,185,129,0.4)]' 
                    : player.payments[currentMonth] === 'exempt'
                    ? 'bg-purple-500 text-white shadow-[0_0_20px_rgba(168,85,247,0.4)]'
                    : 'bg-white/10 text-white/30 hover:bg-white/20'
                  } ${!isAdmin && 'opacity-50 cursor-not-allowed'}`}
                >
                  {player.payments[currentMonth] === true ? (
                    <CheckCircle2 size={24} />
                  ) : player.payments[currentMonth] === 'exempt' ? (
                    <AlertCircle size={24} />
                  ) : (
                    <XCircle size={24} />
                  )}
                </button>
              </motion.div>
            ))}
          </div>
        </section>
      </main>

      {/* MODAL LOGIN ADM */}
      <AnimatePresence>
        {showAdminLogin && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAdminLogin(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-md"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-neutral-900 border border-white/10 rounded-[2rem] p-8 w-full max-w-xs relative z-10"
            >
              <div className="flex flex-col items-center text-center">
                <div className="bg-amber-400 text-amber-950 p-4 rounded-full mb-4 shadow-lg">
                  <Lock size={32} />
                </div>
                <h2 className="text-xl font-black uppercase italic mb-2">Acesso Restrito</h2>
                <p className="text-xs text-white/40 font-bold uppercase tracking-widest mb-6">Digite a senha do administrador</p>
                
                <input 
                  type="password"
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAdminLogin()}
                  placeholder="Senha"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-center font-bold outline-none focus:ring-2 focus:ring-amber-400 transition-all mb-4"
                  autoFocus
                />
                
                <button 
                  onClick={handleAdminLogin}
                  className="w-full bg-amber-400 text-amber-950 font-black uppercase py-3 rounded-xl shadow-lg hover:scale-105 active:scale-95 transition-all"
                >
                  Entrar
                </button>
                <p className="mt-4 text-[10px] text-white/20 font-bold uppercase">Senha: baba123</p>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL CONTRATAÇÃO */}
      <AnimatePresence>
        {isAddingPlayer && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsAddingPlayer(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-md"
            />
            <motion.div 
              initial={{ scale: 0.9, y: 20, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.9, y: 20, opacity: 0 }}
              className="bg-neutral-900 border border-white/10 rounded-[3rem] p-10 w-full max-w-md relative z-10 shadow-[0_30px_100px_rgba(0,0,0,0.5)]"
            >
              <h2 className="text-3xl font-black uppercase italic italic tracking-tighter mb-8 text-center">Novo Atleta</h2>
              
              <div className="space-y-8">
                <div className="flex flex-col items-center gap-4">
                  <div 
                    onClick={() => fileInputRef.current?.click()}
                    className="w-32 h-32 rounded-[2rem] bg-white/5 border-2 border-dashed border-white/20 flex flex-col items-center justify-center text-white/30 cursor-pointer hover:bg-white/10 hover:border-emerald-500 transition-all overflow-hidden relative group"
                  >
                    {newPlayerPhoto ? (
                      <img src={newPlayerPhoto} alt="Preview" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      <>
                        <Camera size={32} />
                        <span className="text-[10px] mt-2 font-black uppercase tracking-widest">Foto do Perfil</span>
                      </>
                    )}
                    <div className="absolute inset-0 bg-emerald-500/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                      <Plus size={32} className="text-white" />
                    </div>
                  </div>
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    onChange={(e) => handlePhotoUpload(e, 'player')} 
                    accept="image/*" 
                    className="hidden" 
                  />
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase tracking-[0.3em] text-white/40 mb-3 block">Nome de Guerra</label>
                  <input 
                    type="text" 
                    value={newPlayerName}
                    onChange={(e) => setNewPlayerName(e.target.value)}
                    placeholder="EX: FALCÃO"
                    className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 focus:ring-2 focus:ring-emerald-500 transition-all outline-none font-black uppercase italic text-lg"
                    autoFocus
                  />
                </div>

                <div className="flex gap-4 pt-4">
                  <button 
                    onClick={() => setIsAddingPlayer(false)}
                    className="flex-1 px-6 py-4 rounded-2xl font-black uppercase text-xs text-white/40 hover:bg-white/5 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button 
                    onClick={addPlayer}
                    disabled={!newPlayerName.trim()}
                    className="flex-1 bg-white text-emerald-900 hover:scale-105 active:scale-95 disabled:opacity-50 px-6 py-4 rounded-2xl font-black uppercase text-xs transition-all shadow-[0_6px_0_rgb(200,200,200)]"
                  >
                    Confirmar
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL CRAQUE DA SEMANA */}
      <AnimatePresence>
        {isSettingPOW && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsSettingPOW(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-md"
            />
            <motion.div 
              initial={{ scale: 0.9, y: 20, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.9, y: 20, opacity: 0 }}
              className="bg-neutral-900 border border-white/10 rounded-[3rem] p-10 w-full max-w-md relative z-10 shadow-[0_30px_100px_rgba(0,0,0,0.5)]"
            >
              <h2 className="text-3xl font-black uppercase italic tracking-tighter mb-2 text-center">Craque da Semana</h2>
              <p className="text-xs text-white/40 font-bold uppercase tracking-widest mb-8 text-center">
                {players.find(p => p.id === selectedPOWId)?.name}
              </p>
              
              <div className="space-y-8">
                <div className="flex flex-col items-center gap-4">
                  <div 
                    onClick={() => powFileInputRef.current?.click()}
                    className="w-48 h-60 rounded-[2rem] bg-amber-400/10 border-2 border-dashed border-amber-400/20 flex flex-col items-center justify-center text-amber-400/30 cursor-pointer hover:bg-amber-400/20 hover:border-amber-400 transition-all overflow-hidden relative group"
                  >
                    {powPhoto ? (
                      <img src={powPhoto} alt="Preview" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      <>
                        <Camera size={48} />
                        <span className="text-[10px] mt-4 font-black uppercase tracking-widest text-center px-4">Foto Especial do Card (Opcional)</span>
                      </>
                    )}
                    <div className="absolute inset-0 bg-amber-400/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                      <Plus size={48} className="text-white" />
                    </div>
                  </div>
                  <input 
                    type="file" 
                    ref={powFileInputRef} 
                    onChange={(e) => handlePhotoUpload(e, 'pow')} 
                    accept="image/*" 
                    className="hidden" 
                  />
                </div>

                <div className="flex gap-4 pt-4">
                  <button 
                    onClick={() => setIsSettingPOW(false)}
                    className="flex-1 px-6 py-4 rounded-2xl font-black uppercase text-xs text-white/40 hover:bg-white/5 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button 
                    onClick={confirmPlayerOfWeek}
                    className="flex-1 bg-amber-400 text-amber-950 hover:scale-105 active:scale-95 px-6 py-4 rounded-2xl font-black uppercase text-xs transition-all shadow-[0_6px_0_rgb(180,140,0)]"
                  >
                    Confirmar Título
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
