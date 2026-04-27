import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowLeft, Sparkles, Heart } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import ReactPlayer from 'react-player';

const YOUTUBE_SHORTS = [
  // Add your direct video / mp4 / shorts links here
  "https://cdn.jumpshare.com/preview/2hiYgbMCRDCdcxHfuRTBwTw7NulwLIvc5TzauHydHYfSxB3a7c1xtQRjkmGNSjgJI6M7iD6d968F7ArwsiO9VTkaxtWgGLkEdaegybZ7h0s9PfqsXbbvlFVjTRRCcN7gm6-NphXBNv7MPZ3YCV0H6m6yjbN-I2pg_cnoHs_AmgI.mp4",
  "https://cdn.jumpshare.com/preview/0y8raSdkrjB6dPgQvfbMqqQvD5-wysZzHrbrBIQKLo4E78k8dw9GYAUlZkzIA8fuj2d03HJ-l7YxqPvuGw6yKSCCFjBgzSemMjrzWzzjYlI_AdGFXEW1rjfmMnuFFfH1Ek_q4mUZdzDyYu6mOquUEG6yjbN-I2pg_cnoHs_AmgI.mp4",
];

export default function Vibe() {
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [currentVideoIndex, setCurrentVideoIndex] = useState(0);
  const [videoPos, setVideoPos] = useState({ top: '20%', left: '20%' });
  const [videoOpacity, setVideoOpacity] = useState(0.25);
  const [hasStarted, setHasStarted] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const streaks: any[] = [];
    const colors = ['#f472b6', '#38bdf8', '#a78bfa', '#34d399', '#fcd34d', '#fb923c'];
    
    for (let i = 0; i < 80; i++) {
       streaks.push({
           x: Math.random() * canvas.width,
           y: Math.random() * canvas.height,
           length: Math.random() * 80 + 20,
           speedX: (Math.random() - 0.5) * 8, // mostly diagonal
           speedY: (Math.random() + 0.5) * 8,
           size: Math.random() * 4 + 2,
           color: colors[Math.floor(Math.random() * colors.length)]
       });
    }

    let animationFrameId: number;

    const render = () => {
      // Trail effect
      ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      streaks.forEach((p) => {
        p.x += p.speedX;
        p.y += p.speedY;

        if (p.x < -100) p.x = canvas.width + 100;
        if (p.x > canvas.width + 100) p.x = -100;
        if (p.y > canvas.height + 100) {
            p.y = -100;
            p.x = Math.random() * canvas.width;
        }
        if (p.y < -100) p.y = canvas.height + 100;

        ctx.beginPath();
        // Draw streak line
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.speedX * 4, p.y - p.speedY * 4);
        ctx.lineWidth = p.size;
        ctx.strokeStyle = p.color;
        ctx.lineCap = 'round';
        
        ctx.shadowBlur = 15;
        ctx.shadowColor = p.color;
        ctx.stroke();
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
    };
  }, []);

  // Handle video floating logic
  useEffect(() => {
     if (!hasStarted) return;
     
     const interval = setInterval(() => {
        setVideoOpacity(0);
        setTimeout(() => {
            // Pick a new random spot that tries to be somewhat visible
            setVideoPos({
               top: `${Math.floor(Math.random() * 60) + 10}%`,
               left: `${Math.floor(Math.random() * 60) + 10}%`
            });
            setVideoOpacity(0.25);
            // Attempt to play if paused
            if (videoRef.current) {
               videoRef.current.play().catch(e => console.log('play prevented', e));
               videoRef.current.volume = 1;
            }
        }, 1500); // the video stays hidden for 1.5s then appears
     }, 8000); // move every 8 seconds

     return () => clearInterval(interval);
  }, [hasStarted]);

  return (
    <div 
        className="relative min-h-screen bg-[#0a0a0a] text-white overflow-hidden flex flex-col items-center justify-center p-6" 
        onClick={() => {
            setHasStarted(true);
            if (videoRef.current) {
                videoRef.current.play().catch(console.error);
            }
        }}
    >
      <canvas ref={canvasRef} className="absolute inset-0 z-0" />
      
      <div className="absolute inset-0 z-10 pointer-events-none bg-gradient-to-t from-black via-transparent to-black opacity-80 mix-blend-overlay"></div>
      
      {/* Container is always rendered to allow synchronous play() */}
      <div
         className="absolute z-10 pointer-events-none rounded-3xl overflow-hidden shadow-[0_0_50px_rgba(255,255,255,0.4)] transition-opacity duration-1000 ease-in-out"
         style={{
             top: videoPos.top,
             left: videoPos.left,
             width: '300px',
             height: '500px',
             transform: 'translate(-50%, -50%)', // center on the coordinates
             opacity: hasStarted && videoOpacity === 0.25 ? 0.9 : 0, // High visibility only when started
             pointerEvents: hasStarted ? 'auto' : 'none'
         }}
      >
         <video 
            ref={videoRef}
            src={YOUTUBE_SHORTS[currentVideoIndex]}
            autoPlay={hasStarted}
            playsInline
            muted={false} // Unmuted since user clicked to start
            onEnded={() => {
                setCurrentVideoIndex((prev) => (prev + 1) % YOUTUBE_SHORTS.length);
            }}
            onCanPlay={() => {
                if (hasStarted && videoRef.current) {
                    videoRef.current.play().catch(console.error);
                }
            }}
            className="w-full h-full object-cover bg-black/80"
         />
      </div>

      <button 
        onClick={(e) => { e.stopPropagation(); navigate('/'); }}
        className="absolute top-6 left-6 z-30 p-3 bg-white/5 hover:bg-white/15 backdrop-blur-md rounded-full transition-all border border-white/10"
      >
        <ArrowLeft className="w-6 h-6" />
      </button>

      <motion.div 
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', bounce: 0.4, duration: 1 }}
        className="z-20 text-center space-y-6 max-w-2xl relative"
      >
        <div className="absolute -inset-20 bg-fuchsia-500/10 blur-[100px] -z-10 rounded-full mix-blend-screen pointer-events-none"></div>

        <motion.div 
          animate={{ rotate: [-5, 5, -5] }}
          transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
          className="inline-block"
        >
          <Sparkles className="w-16 h-16 text-[#e879f9] mx-auto drop-shadow-[0_0_15px_rgba(232,121,249,0.8)]" strokeWidth={2.5} />
        </motion.div>
        
        <h1 className="text-6xl sm:text-8xl font-black italic uppercase tracking-tighter text-[#c0bbf2] drop-shadow-[0_0_20px_rgba(192,187,242,0.4)] relative">
          <span className="absolute -inset-1 blur-sm text-[#38bdf8] opacity-50 select-none">COMEBACK</span>
          <span className="relative z-10 bg-clip-text text-transparent bg-gradient-to-r from-[#93c5fd] via-[#c4b5fd] to-[#fbcfe8]">COMEBACK</span>    
        </h1>
        
        <p className="text-xl sm:text-2xl font-mono text-white/90 font-medium">
          Created with <Heart className="w-6 h-6 inline text-[#f472b6] fill-[#f472b6] drop-shadow-[0_0_10px_rgba(244,114,182,0.8)] mx-1" /> by{' '}
          <a 
            href="https://instagram.com/xavy.dev" 
            target="_blank" 
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-white hover:text-[#a855f7] transition-colors relative after:absolute after:bottom-0 after:left-0 after:w-full after:h-0.5 after:bg-[#a855f7] after:scale-x-0 hover:after:scale-x-100 after:transition-transform after:origin-left"
          >
            @xavy.dev
          </a>
        </p>

        {!hasStarted && (
          <motion.div 
             animate={{ opacity: [0.3, 1, 0.3] }} 
             transition={{ repeat: Infinity, duration: 2 }}
             className="mt-12 text-sm uppercase tracking-widest text-[#d8b4fe] font-semibold"
          >
            
          Click Here | You are bigger than one result.
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}
