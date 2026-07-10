import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, Terminal, User, Users, Swords, Cpu, Crosshair } from 'lucide-react';
import './_group.css';

export function Neon() {
  const [bots, setBots] = useState(4);
  const [code, setCode] = useState('');

  return (
    <div 
      className="relative min-h-[100dvh] w-full bg-[#0a0a1a] text-white overflow-hidden flex flex-col selection:bg-[#00f5ff] selection:text-[#0a0a1a]"
      style={{
        fontFamily: "'Rajdhani', sans-serif",
        backgroundImage: `
          linear-gradient(rgba(0, 245, 255, 0.03) 1px, transparent 1px),
          linear-gradient(90deg, rgba(0, 245, 255, 0.03) 1px, transparent 1px)
        `,
        backgroundSize: '20px 20px',
        backgroundPosition: 'center center'
      }}
    >
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link href="https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;500;600;700&display=swap" rel="stylesheet" />

      {/* Scanline overlay */}
      <div 
        className="pointer-events-none absolute inset-0 z-50 h-[10vh] w-full bg-gradient-to-b from-transparent via-[#00f5ff]/5 to-transparent opacity-50"
        style={{ animation: 'scanline 8s linear infinite' }}
      />
      
      {/* Vignette */}
      <div className="pointer-events-none absolute inset-0 z-40 bg-[radial-gradient(ellipse_at_center,transparent_0%,#0a0a1a_100%)] opacity-80" />

      <main className="relative z-10 flex-1 w-full max-w-md mx-auto p-5 overflow-y-auto pb-12 flex flex-col gap-8">
        
        {/* Header */}
        <div className="text-center mt-6 tracking-widest flex flex-col items-center">
          <div className="flex items-center gap-3 mb-1">
            <Terminal className="text-[#00f5ff] w-6 h-6" style={{ filter: 'drop-shadow(0 0 5px #00f5ff)' }} />
            <h1 
              className="text-4xl font-bold italic"
              style={{
                color: '#fff',
                textShadow: '0 0 4px #00f5ff, 0 0 10px #00f5ff, 0 0 20px #00f5ff',
                letterSpacing: '0.1em'
              }}
            >
              AMONG US
            </h1>
          </div>
          <div className="text-[#ff00aa] text-sm uppercase font-semibold tracking-[0.3em]" style={{ textShadow: '0 0 5px #ff00aa' }}>
            Cyber Arena Protocol
          </div>
        </div>

        {/* Primary Action */}
        <button 
          className="neon-btn-cyan w-full py-4 text-xl font-bold uppercase tracking-widest flex items-center justify-center gap-3 mt-4"
          style={{ animation: 'pulse-cyan 3s infinite' }}
        >
          <Users className="w-6 h-6" />
          Create Room
        </button>

        {/* Solo Match */}
        <div className="border border-[#ff00aa]/30 bg-[#ff00aa]/5 p-5 relative backdrop-blur-sm">
          <div className="absolute -top-3 left-4 bg-[#0a0a1a] px-2 text-[#ff00aa] text-xs uppercase font-bold tracking-widest border border-[#ff00aa]/50">
            Training Simulation
          </div>
          
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <span className="text-gray-400 uppercase text-sm font-semibold flex items-center gap-2">
                <Cpu className="w-4 h-4 text-[#ff00aa]" /> Opponents
              </span>
              <div className="flex items-center gap-4 border border-[#ff00aa]/50 bg-[#0a0a1a] px-3 py-1">
                <button 
                  className="text-[#ff00aa] hover:text-white transition-colors"
                  onClick={() => setBots(b => Math.max(1, b - 1))}
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <span className="text-[#ff00aa] font-bold w-12 text-center text-lg" style={{ textShadow: '0 0 5px #ff00aa' }}>
                  {bots} BOTS
                </span>
                <button 
                  className="text-[#ff00aa] hover:text-white transition-colors"
                  onClick={() => setBots(b => Math.min(10, b + 1))}
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            </div>
            
            <button className="neon-btn-magenta w-full py-3 text-lg font-bold uppercase tracking-wider flex items-center justify-center gap-2 mt-2">
              <Swords className="w-5 h-5" />
              Play Solo
            </button>
          </div>
        </div>

        {/* Divider */}
        <div className="flex items-center gap-4 my-2 opacity-80">
          <div className="h-px flex-1 bg-gradient-to-r from-transparent via-[#00f5ff] to-transparent" />
          <span className="text-[#00f5ff] text-xs font-bold tracking-[0.2em] uppercase" style={{ textShadow: '0 0 5px #00f5ff' }}>
            Or Join A Room
          </span>
          <div className="h-px flex-1 bg-gradient-to-r from-[#00f5ff] via-[#00f5ff] to-transparent" />
        </div>

        {/* Join Room */}
        <div className="flex gap-3">
          <div className="relative flex-1">
            <input 
              type="text" 
              value={code}
              onChange={e => setCode(e.target.value.toUpperCase())}
              placeholder="ENTER CODE" 
              maxLength={6}
              className="neon-input w-full h-full px-4 text-xl font-mono uppercase tracking-widest bg-[#0a0a1a]"
            />
            {code.length === 0 && (
              <div className="absolute right-4 top-1/2 -translate-y-1/2 w-2 h-5 bg-[#00f5ff]" style={{ animation: 'blink 1s infinite' }} />
            )}
          </div>
          <button className="border border-[#00f5ff]/50 text-[#00f5ff] hover:bg-[#00f5ff]/10 px-6 py-3 font-bold text-lg uppercase tracking-wider transition-colors" style={{ textShadow: '0 0 5px #00f5ff' }}>
            Join
          </button>
        </div>

        {/* Active Room Preview (Sample) */}
        <div className="mt-8 border border-[#00f5ff]/30 bg-[#0a0a1a]/80 backdrop-blur-md relative pb-6 shadow-[0_0_15px_rgba(0,245,255,0.1)]">
          <div className="absolute -top-[1px] left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-[#00f5ff] to-transparent" />
          
          <div className="p-4 border-b border-[#00f5ff]/20 bg-[#00f5ff]/5 flex flex-col items-center justify-center gap-1">
            <div className="text-gray-400 text-xs uppercase font-bold tracking-widest">Network Match ID</div>
            <div className="text-3xl font-mono text-[#00f5ff] tracking-[0.3em] font-bold" style={{ textShadow: '0 0 10px #00f5ff' }}>
              XYZ789
            </div>
          </div>

          <div className="p-5 flex flex-col gap-3">
            <div className="text-[#ff00aa] text-xs font-bold uppercase tracking-widest mb-1 flex items-center justify-between">
              <span>Connected Subjects</span>
              <span>2/10</span>
            </div>
            
            {/* Player 1 - HOST */}
            <div className="flex items-center justify-between p-3 border border-[#00f5ff] bg-[#00f5ff]/10">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 border border-[#00f5ff] flex items-center justify-center bg-[#0a0a1a]">
                  <User className="w-5 h-5 text-[#00f5ff]" />
                </div>
                <span className="text-[#00f5ff] font-bold text-lg tracking-wider" style={{ textShadow: '0 0 5px #00f5ff' }}>YOU</span>
              </div>
              <span className="bg-[#ff00aa] text-[#0a0a1a] text-[10px] font-black uppercase px-2 py-1 tracking-widest shadow-[0_0_5px_#ff00aa]">
                HOST
              </span>
            </div>

            {/* Player 2 */}
            <div className="flex items-center justify-between p-3 border border-gray-800 bg-gray-900/50">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 border border-gray-700 flex items-center justify-center bg-[#0a0a1a]">
                  <User className="w-5 h-5 text-gray-400" />
                </div>
                <span className="text-gray-300 font-semibold text-lg tracking-wider">ALICE</span>
              </div>
            </div>

            {/* Empty slots indicator */}
            <div className="flex items-center justify-center py-4 border border-dashed border-gray-800/50 text-gray-500 text-sm uppercase tracking-widest font-mono">
              Waiting for players
              <span className="ml-1 flex gap-1">
                <span style={{ animation: 'blink 1.5s infinite 0s' }}>.</span>
                <span style={{ animation: 'blink 1.5s infinite 0.3s' }}>.</span>
                <span style={{ animation: 'blink 1.5s infinite 0.6s' }}>.</span>
              </span>
            </div>
            
            <button className="neon-btn-green w-full py-4 text-xl font-bold uppercase tracking-widest flex items-center justify-center gap-3 mt-4 relative group">
              <Crosshair className="w-6 h-6 group-hover:rotate-90 transition-transform duration-300" />
              Start Game
            </button>
          </div>
        </div>

      </main>
    </div>
  );
}
