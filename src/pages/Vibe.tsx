import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, Sparkles, Zap, Heart } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function Vibe() {
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    // Canvas magic
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const particles: any[] = [];
    for (let i = 0; i < 150; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vX: (Math.random() - 0.5) * 5,
        vY: (Math.random() - 0.5) * 5,
        size: Math.random() * 8 + 2,
        color: `hsl(${Math.random() * 360}, 100%, 60%)`
      });
    }

    let animationFrameId: number;

    const render = () => {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      particles.forEach((p) => {
        p.x += p.vX;
        p.y += p.vY;

        if (p.x < 0 || p.x > canvas.width) p.vX *= -1;
        if (p.y < 0 || p.y > canvas.height) p.vY *= -1;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        
        ctx.shadowBlur = 10;
        ctx.shadowColor = p.color;
        ctx.fill();
        ctx.shadowBlur = 0;
      });

      animationFrameId = requestAnimationFrame(render);
    };
    render();

    const handleResize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
      if (audioContextRef.current) {
         audioContextRef.current.close();
      }
    };
  }, []);

  const playSynth = () => {
    if (isPlaying) return;
    setIsPlaying(true);
    
    // Synthwave pseudo-random melody
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    const audioCtx = new Ctx();
    audioContextRef.current = audioCtx;

    const notes = [220, 261.63, 293.66, 329.63, 392.00, 440, 523.25]; // Am pentatonicish
    
    // Simple sequencer
    let time = audioCtx.currentTime;
    for (let i = 0; i < 64; i++) { // 64 notes
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      
      osc.type = i % 4 === 0 ? 'sawtooth' : 'square';
      osc.frequency.value = notes[Math.floor(Math.random() * notes.length)] * (i%8 === 0 ? 0.5 : 1);
      
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      
      const t = time + i * 0.2; // 0.2 seconds per note
      
      osc.start(t);
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.3, t + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
      osc.stop(t + 0.2);
    }
  };

  return (
    <div className="relative min-h-screen bg-black text-white overflow-hidden flex flex-col items-center justify-center p-6" onClick={playSynth}>
      <canvas ref={canvasRef} className="absolute inset-0 z-0" />
      
      <div className="absolute inset-0 z-10 pointer-events-none bg-gradient-to-t from-fuchsia-900/50 via-transparent to-blue-900/50 mix-blend-overlay"></div>
      
      <button 
        onClick={(e) => { e.stopPropagation(); navigate('/'); }}
        className="absolute top-6 left-6 z-30 p-3 bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-full transition-all"
      >
        <ArrowLeft className="w-6 h-6" />
      </button>

      <motion.div 
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', bounce: 0.5, duration: 1 }}
        className="z-20 text-center space-y-6 max-w-2xl"
      >
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ duration: 10, repeat: Infinity, ease: 'linear' }}
          className="inline-block"
        >
          <Sparkles className="w-24 h-24 text-fuchsia-400 mx-auto" />
        </motion.div>
        
        <h1 className="text-6xl sm:text-8xl font-black italic uppercase tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-fuchsia-400 via-cyan-400 to-fuchsia-400 bg-[length:200%_auto] animate-gradient">
          XAVY VIBES
        </h1>
        
        <p className="text-xl sm:text-2xl font-mono text-cyan-200">
          Created with <Heart className="w-5 h-5 inline text-pink-500 fill-pink-500" /> by @xavy.dev
        </p>

        {!isPlaying && (
          <motion.div 
             animate={{ y: [0, -10, 0] }} 
             transition={{ repeat: Infinity, duration: 2 }}
             className="mt-12 text-sm uppercase tracking-widest text-fuchsia-300 opacity-80"
          >
            Click anywhere to join the party
          </motion.div>
        )}
      </motion.div>

      {/* CSS for gradient animation */}
      <style>{`
        @keyframes gradient {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        .animate-gradient {
          animation: gradient 3s linear infinite;
        }
      `}</style>
    </div>
  );
}
