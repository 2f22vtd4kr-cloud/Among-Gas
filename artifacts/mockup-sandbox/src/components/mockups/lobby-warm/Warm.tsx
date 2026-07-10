import React from 'react';
import { Users, User, Plus, Minus, ChevronRight, Hash, Play, Sparkles, Send } from 'lucide-react';

export function Warm() {
  return (
    <div 
      className="w-full min-h-[100dvh] flex flex-col relative overflow-y-auto"
      style={{
        backgroundColor: '#1f0e05',
        backgroundImage: 'radial-gradient(circle at 50% 20%, #301705 0%, #1f0e05 60%)',
        color: '#fdf0dc',
        fontFamily: "'Nunito', sans-serif"
      }}
    >
      <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&display=swap" rel="stylesheet" />

      {/* Title Section */}
      <div className="px-6 pt-12 pb-6 text-center flex flex-col items-center">
        <div className="w-16 h-16 rounded-3xl flex items-center justify-center mb-4 shadow-[0_4px_20px_rgba(245,166,35,0.3)]" style={{ backgroundColor: '#f5a623', color: '#1f0e05' }}>
          <Users size={32} strokeWidth={2.5} />
        </div>
        <h1 className="text-4xl font-black tracking-tight" style={{ color: '#f5a623' }}>
          AMONG US
        </h1>
        <p className="text-lg font-semibold mt-1" style={{ color: '#d8c3a5' }}>
          Cozy Colony Briefing
        </p>
      </div>

      <div className="px-5 flex flex-col gap-6 pb-12">
        {/* Create Room Button */}
        <button 
          className="w-full py-4 px-6 rounded-3xl font-bold text-xl flex items-center justify-between transition-transform active:scale-95"
          style={{ 
            backgroundColor: '#f5a623', 
            color: '#1f0e05',
            boxShadow: '0 8px 0 #cc8412'
          }}
        >
          <div className="flex items-center gap-3">
            <Sparkles size={24} />
            <span>CREATE ROOM</span>
          </div>
          <ChevronRight size={24} />
        </button>

        {/* Play Solo Panel */}
        <div 
          className="w-full rounded-3xl p-5"
          style={{ backgroundColor: '#2a1800' }}
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center" style={{ backgroundColor: '#3d2508', color: '#f5a623' }}>
              <User size={20} />
            </div>
            <div>
              <h2 className="font-bold text-lg leading-tight" style={{ color: '#fdf0dc' }}>PLAY SOLO VS BOTS</h2>
              <p className="text-sm" style={{ color: '#d8c3a5' }}>Practice offline</p>
            </div>
          </div>
          
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center p-1.5 rounded-2xl" style={{ backgroundColor: '#1f0e05' }}>
              <button className="w-10 h-10 rounded-xl flex items-center justify-center hover:bg-[#2a1800] transition-colors" style={{ color: '#d8c3a5' }}>
                <Minus size={20} />
              </button>
              <div className="px-4 font-bold text-lg" style={{ color: '#f5a623' }}>
                4 bots
              </div>
              <button className="w-10 h-10 rounded-xl flex items-center justify-center hover:bg-[#2a1800] transition-colors" style={{ color: '#d8c3a5' }}>
                <Plus size={20} />
              </button>
            </div>
            
            <button 
              className="flex-1 py-3 rounded-2xl font-bold flex items-center justify-center gap-2 active:scale-95"
              style={{ backgroundColor: '#4caf50', color: '#fff', boxShadow: '0 6px 0 #388e3c' }}
            >
              <Play size={18} fill="currentColor" />
              SOLO
            </button>
          </div>
        </div>

        {/* Divider */}
        <div className="flex items-center gap-4 my-2">
          <div className="flex-1 h-px bg-[#3d2508]" />
          <span className="text-sm font-bold tracking-wider" style={{ color: '#d8c3a5' }}>OR JOIN A ROOM</span>
          <div className="flex-1 h-px bg-[#3d2508]" />
        </div>

        {/* Join Room */}
        <div className="flex gap-3">
          <div className="flex-1 relative">
            <div className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: '#a88a66' }}>
              <Hash size={20} />
            </div>
            <input 
              type="text" 
              placeholder="ENTER CODE" 
              className="w-full py-4 pl-12 pr-4 rounded-3xl font-mono text-lg font-bold outline-none uppercase placeholder:text-[#a88a66] border-none ring-0"
              style={{ backgroundColor: '#2a1800', color: '#fdf0dc' }}
            />
          </div>
          <button 
            className="px-6 py-4 rounded-3xl font-bold flex items-center justify-center active:scale-95"
            style={{ backgroundColor: '#3d2508', color: '#fdf0dc' }}
          >
            <Send size={20} />
          </button>
        </div>

        {/* Sample Room */}
        <div className="mt-4 opacity-50 text-center">
          <span className="text-xs uppercase tracking-widest font-bold" style={{ color: '#d8c3a5' }}>
            Lobby Preview Below
          </span>
          <div className="w-px h-6 mx-auto mt-2" style={{ backgroundColor: '#3d2508' }} />
        </div>

        <div 
          className="w-full rounded-3xl p-5 border-2 border-dashed"
          style={{ backgroundColor: '#1a0d04', borderColor: '#3d2508' }}
        >
          <div className="text-center mb-6">
            <p className="text-sm font-bold tracking-widest mb-1" style={{ color: '#f5a623' }}>ROOM CODE</p>
            <h2 className="text-5xl font-black font-mono tracking-widest" style={{ color: '#fdf0dc', textShadow: '0 2px 10px rgba(245,166,35,0.2)' }}>
              XYZ789
            </h2>
          </div>

          <div className="flex flex-col gap-3 mb-6">
            {/* Player 1 - HOST */}
            <div className="flex items-center gap-4 p-3 rounded-2xl" style={{ backgroundColor: '#2a1800' }}>
              <div className="w-12 h-12 rounded-xl flex items-center justify-center font-black text-xl" style={{ backgroundColor: '#f5a623', color: '#1f0e05' }}>
                Y
              </div>
              <div className="flex-1">
                <div className="font-bold text-lg" style={{ color: '#fdf0dc' }}>You</div>
                <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#f5a623' }}>HOST</div>
              </div>
            </div>

            {/* Player 2 */}
            <div className="flex items-center gap-4 p-3 rounded-2xl" style={{ backgroundColor: '#2a1800' }}>
              <div className="w-12 h-12 rounded-xl flex items-center justify-center font-black text-xl" style={{ backgroundColor: '#5c3a21', color: '#fdf0dc' }}>
                A
              </div>
              <div className="flex-1">
                <div className="font-bold text-lg" style={{ color: '#fdf0dc' }}>Alice</div>
              </div>
            </div>

            {/* Waiting Row */}
            <div className="flex items-center justify-center gap-3 p-4 rounded-2xl border-2 border-dashed" style={{ borderColor: '#3d2508', opacity: 0.8 }}>
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-[#f5a623] animate-pulse" />
                <span className="w-1.5 h-1.5 rounded-full bg-[#f5a623] animate-pulse" style={{ animationDelay: '300ms' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-[#f5a623] animate-pulse" style={{ animationDelay: '600ms' }} />
              </div>
              <span className="text-sm font-bold" style={{ color: '#a88a66' }}>Waiting for players... (2/10)</span>
            </div>
          </div>

          <button 
            className="w-full py-4 px-6 rounded-3xl font-bold text-xl flex items-center justify-center gap-3 active:scale-95 transition-transform"
            style={{ 
              backgroundColor: '#4caf50', 
              color: '#fff',
              boxShadow: '0 8px 0 #388e3c'
            }}
          >
            <Play fill="currentColor" size={24} />
            <span>START GAME</span>
          </button>
        </div>

      </div>
    </div>
  );
}
