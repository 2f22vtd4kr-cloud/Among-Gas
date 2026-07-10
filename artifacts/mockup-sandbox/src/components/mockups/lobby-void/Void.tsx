import React, { useState } from 'react';
import { Users, User, Plus, Minus, ChevronRight, Skull, ShieldAlert, Cpu } from 'lucide-react';
import './_group.css';

export function Void() {
  const [botCount, setBotCount] = useState(4);
  const [roomCode, setRoomCode] = useState('');

  return (
    <div className="relative w-full h-[844px] max-w-[390px] mx-auto overflow-hidden bg-[#050810] text-[#a0a5b5] font-mono-custom flex flex-col items-center">
      <div className="noise-bg"></div>
      <div className="scanlines"></div>

      {/* Screen container */}
      <div className="relative z-10 w-full h-full overflow-y-auto overflow-x-hidden p-6 flex flex-col gap-8 pb-12 custom-scrollbar">
        
        {/* Title Section */}
        <div className="flex flex-col items-center mt-8 mb-2">
          <div className="flex items-center justify-center gap-3 mb-2 text-[#ff2a00] crt-flicker">
            <Skull size={24} className="opacity-80" />
            <h1 className="font-display text-4xl font-black tracking-widest text-[#ff2a00]" style={{ textShadow: '0 0 15px rgba(255, 42, 0, 0.8), 0 0 30px rgba(255, 42, 0, 0.4)' }}>
              AMONG US
            </h1>
            <Skull size={24} className="opacity-80" />
          </div>
          <p className="text-xs tracking-[0.2em] uppercase text-[#00d4ff] opacity-70 mt-1">
            Emergency Broadcast System
          </p>
        </div>

        {/* Create Room Button */}
        <button className="w-full py-4 cyber-button font-display font-bold text-lg flex items-center justify-center gap-3 bg-[#050810] cursor-pointer">
          <Users size={20} />
          <span>CREATE ROOM</span>
        </button>

        {/* Play Solo Panel */}
        <div className="w-full border border-white/10 bg-[#0a0f1c]/80 p-5 relative overflow-hidden backdrop-blur-sm">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[#00d4ff]/50 to-transparent"></div>
          
          <div className="flex items-center gap-2 mb-5 text-[#00d4ff]">
            <Cpu size={18} />
            <h2 className="font-display text-sm font-bold tracking-widest uppercase">Play Solo vs Bots</h2>
          </div>
          
          <div className="flex items-center justify-between mb-6">
            <span className="text-xs opacity-80 tracking-widest uppercase text-white/50">Bots:</span>
            <div className="flex items-center gap-4 bg-black/50 px-2 py-1 border border-white/10 rounded-sm">
              <button 
                onClick={() => setBotCount(Math.max(1, botCount - 1))}
                className="text-[#00d4ff] hover:text-white p-1 cursor-pointer transition-colors"
              >
                <Minus size={16} />
              </button>
              <span className="font-display text-lg w-16 text-center text-white">{botCount} bots</span>
              <button 
                onClick={() => setBotCount(Math.min(14, botCount + 1))}
                className="text-[#00d4ff] hover:text-white p-1 cursor-pointer transition-colors"
              >
                <Plus size={16} />
              </button>
            </div>
          </div>
          
          <button className="w-full py-3 cyber-button text-xs font-bold flex items-center justify-center gap-2 cursor-pointer">
            <span>PLAY SOLO</span>
            <ChevronRight size={14} />
          </button>
        </div>

        {/* Divider */}
        <div className="flex items-center gap-4 w-full opacity-50 my-2">
          <div className="h-px bg-white/20 flex-1"></div>
          <span className="text-[10px] tracking-widest">OR JOIN A ROOM</span>
          <div className="h-px bg-white/20 flex-1"></div>
        </div>

        {/* Join Room */}
        <div className="flex gap-2 w-full">
          <input
            type="text"
            value={roomCode}
            onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
            placeholder="ENTER CODE"
            className="flex-1 bg-black/50 border border-white/20 px-4 py-3 text-white font-display uppercase tracking-widest placeholder:text-white/20 focus:outline-none focus:border-[#00d4ff]/50 focus:shadow-[0_0_10px_rgba(0,212,255,0.2)] transition-all rounded-none"
            maxLength={6}
          />
          <button className="px-6 border border-white/20 hover:border-[#00d4ff]/50 text-white/70 hover:text-[#00d4ff] transition-all bg-black/50 flex items-center justify-center cursor-pointer font-bold tracking-widest">
            JOIN
          </button>
        </div>

        {/* Sample Room View (Created) */}
        <div className="mt-8 border-t border-[#ff2a00]/30 pt-10 relative">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-[#050810] px-4 text-[#ff2a00] text-[10px] tracking-widest flex items-center gap-2 border border-[#ff2a00]/30 rounded-full py-1">
            <ShieldAlert size={12} />
            <span>ACTIVE SIGNAL</span>
          </div>

          <div className="flex flex-col items-center mb-8">
            <span className="text-[10px] text-white/40 mb-2 uppercase tracking-widest">Frequency Code</span>
            <div className="font-display text-5xl font-black text-white tracking-[0.2em] crt-flicker relative">
              XYZ789
              <div className="absolute top-0 left-0 w-full h-full text-[#ff2a00] opacity-50 blur-[4px] -z-10 mix-blend-screen select-none">XYZ789</div>
              <div className="absolute top-0 left-0 w-full h-full text-[#00d4ff] opacity-30 blur-[8px] -z-10 mix-blend-screen translate-x-1 select-none">XYZ789</div>
            </div>
          </div>

          <div className="space-y-2 mb-10">
            <div className="text-[10px] text-white/40 mb-3 uppercase tracking-widest flex justify-between border-b border-white/10 pb-2">
              <span>Crew Manifest</span>
              <span>2/15</span>
            </div>
            
            {/* Player Row: You */}
            <div className="flex items-center justify-between p-3 bg-black/60 border-l-2 border-[#ff2a00]">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-sm bg-[#ff2a00]/20 border border-[#ff2a00]/50 flex items-center justify-center text-[#ff2a00]">
                  <User size={16} />
                </div>
                <span className="text-white font-bold tracking-wider">YOU</span>
              </div>
              <span className="text-[9px] bg-[#ff2a00]/20 text-[#ff2a00] px-2 py-1 uppercase tracking-widest rounded-sm">Host</span>
            </div>

            {/* Player Row: Alice */}
            <div className="flex items-center justify-between p-3 bg-black/40 border-l-2 border-white/10">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-sm bg-white/5 border border-white/10 flex items-center justify-center text-white/50">
                  <User size={16} />
                </div>
                <span className="text-white/70 tracking-wider">ALICE</span>
              </div>
              <span className="text-[9px] text-white/30 uppercase tracking-widest">Crew</span>
            </div>

            {/* Waiting row */}
            <div className="flex items-center justify-center p-3 bg-transparent border border-dashed border-white/10 opacity-50 mt-2">
              <span className="text-xs tracking-widest uppercase animate-pulse">Waiting for players...</span>
            </div>
          </div>

          <button className="w-full py-4 font-display font-bold text-lg flex items-center justify-center gap-3 bg-[#050810] cursor-pointer text-[#00ff88] border border-[#00ff88]/50 hover:bg-[#00ff88]/10 hover:border-[#00ff88] transition-all" style={{ boxShadow: '0 0 10px rgba(0, 255, 136, 0.2), inset 0 0 10px rgba(0, 255, 136, 0.1)' }}>
            <ChevronRight size={20} />
            <span>START GAME</span>
          </button>
        </div>

      </div>
      
      {/* Scrollbar hide style */}
      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 0px;
          background: transparent;
        }
      `}</style>
    </div>
  );
}