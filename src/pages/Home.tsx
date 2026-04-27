import { useState, useRef } from "react";
import { Download, Play, Square, Loader2, AlertCircle, ExternalLink, Archive, Printer, Heart, Sparkles } from "lucide-react";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import { motion, AnimatePresence } from "motion/react";
import { useNavigate } from "react-router-dom";

type ResultRecord = Record<string, string>;

export default function Home() {
  const navigate = useNavigate();
  const [exam, setExam] = useState<"hs" | "hslc">("hslc");
  const [prefix, setPrefix] = useState("B26");
  const [rollCode, setRollCode] = useState("");
  const [startNo, setStartNo] = useState("");
  const [endNo, setEndNo] = useState("");
  const [delayStr, setDelayStr] = useState("500");
  
  const [isFetching, setIsFetching] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentFetch, setCurrentFetch] = useState<string | null>(null);
  
  const [results, setResults] = useState<ResultRecord[]>([]);
  const [errorLog, setErrorLog] = useState<{rollNo: string, error: string}[]>([]);
  
  const [isZipping, setIsZipping] = useState(false);
  const [zipProgress, setZipProgress] = useState(0);

  // Ref to track if we should stop
  const stopRequested = useRef(false);

  const handleStart = async () => {
    if (!rollCode || !startNo || !endNo) return;
    
    let start = parseInt(startNo);
    let end = parseInt(endNo);
    
    if (isNaN(start) || isNaN(end) || start > end) {
      alert("Invalid start or end roll numbers");
      return;
    }

    if (end - start + 1 > 200) {
      alert("Please limit to fetching 200 records at a time to reduce server load.");
      return;
    }

    const delay = parseInt(delayStr) || 500;

    setIsFetching(true);
    setProgress(0);
    setResults([]);
    setErrorLog([]);
    stopRequested.current = false;

    const total = end - start + 1;
    let completed = 0;

    for (let current = start; current <= end; current++) {
      if (stopRequested.current) {
        break;
      }
      
      const currentNoStr = current.toString();
      const paddedLength = exam === 'hs' ? 5 : 4;
      const currentNoFormatted = currentNoStr.padStart(Math.max(startNo.length, paddedLength), '0');
      setCurrentFetch(currentNoFormatted);

      try {
        let fetchUrl = `/api/scrape?exam=${exam}&roll=${encodeURIComponent(rollCode)}&no=${encodeURIComponent(currentNoFormatted)}`;
        if (exam === 'hslc') {
            fetchUrl += `&prefix=${encodeURIComponent(prefix)}`;
        }
        const response = await fetch(fetchUrl);
        const resultJSON = await response.json();

        if (resultJSON.success && resultJSON.data) {
          const rowData = { ...resultJSON.data, _sourceUrl: resultJSON.url };
          setResults(prev => [...prev, rowData]);
        } else {
          setErrorLog(prev => [...prev, { rollNo: currentNoFormatted, error: resultJSON.error || "Result not found or invalid" }]);
        }
      } catch (err: any) {
        setErrorLog(prev => [...prev, { rollNo: currentNoFormatted, error: err.message }]);
      }

      completed++;
      setProgress(Math.round((completed / total) * 100));

      // Wait between requests if there are more
      if (current < end && !stopRequested.current && delay > 0) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    setIsFetching(false);
    setCurrentFetch(null);
  };

  const handleStop = () => {
    stopRequested.current = true;
  };

  const exportToCSV = () => {
    if (results.length === 0) return;

    // Extract all unique headers from all results
    const headersSet = new Set<string>();
    results.forEach(res => {
      Object.keys(res).forEach(k => {
          if (!k.startsWith('_')) headersSet.add(k);
      });
    });
    
    // Convert Set to Array and prioritize Roll Code and Roll Number
    const headers = Array.from(headersSet).sort((a, b) => {
        const order = ['Roll Code', 'Roll Number', 'Name', "Father's Name", "Mother's Name", 'Registration No', 'DOB', 'School', 'Centre Name', 'Result', 'Grand Total'];
        const getIdx = (key: string) => {
            const idx = order.indexOf(key);
            if (idx !== -1) return idx;
            if (key.startsWith('Subject:')) return order.length + 1; // Put subjects at the end
            return 999;
        };
        const intA = getIdx(a);
        const intB = getIdx(b);
        if (intA !== intB) return intA - intB;
        return a.localeCompare(b);
    });

    const csvRows = [];
    // Add header row
    csvRows.push(headers.map(h => `"${h.replace(/"/g, '""')}"`).join(","));

    // Add data rows
    results.forEach(row => {
      const values = headers.map(header => {
        const val = row[header] || "";
        return `"${String(val).replace(/"/g, '""')}"`;
      });
      csvRows.push(values.join(","));
    });

    const csvContent = csvRows.join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `results-${rollCode}-${startNo}-to-${endNo}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportToZip = async () => {
    if (results.length === 0) return;
    
    setIsZipping(true);
    setZipProgress(0);
    
    const zip = new JSZip();

    for (let i = 0; i < results.length; i++) {
        const res = results[i];
        const resCode = res['Roll Code'];
        const resNo = res['Roll Number'];
        
        try {
            const url = `/api/marksheet-html?exam=${exam}&roll=${resCode}&no=${resNo}` + (exam === 'hslc' ? `&prefix=${res['_prefix'] || prefix}` : '');
            const response = await fetch(url);
            if (response.ok) {
                const html = await response.text();
                const filename = `Marksheet_${resCode}_${resNo}.html`;
                zip.file(filename, html);
            }
        } catch (e) {
            console.error("Failed to fetch HTML for", resCode, resNo);
        }
        
        setZipProgress(Math.round(((i + 1) / results.length) * 100));
    }

    const content = await zip.generateAsync({ type: 'blob' });
    saveAs(content, `Marksheets_${rollCode}_${startNo}_to_${endNo}.zip`);
    
    setIsZipping(false);
    setZipProgress(0);
  };

  return (
    <div className="min-h-screen bg-[#FDFDFE] text-[#2D334A] p-6 font-sans relative overflow-x-hidden selection:bg-[#6C5CE7] selection:text-white">
      
      {/* Soft Decorative Background Gradients resembling studentonlinetools.com */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[500px] bg-[#E3E8FF] rounded-full mix-blend-multiply filter blur-[120px] opacity-70 pointer-events-none -z-10" />
      <div className="absolute top-[-10%] right-[-10%] w-[50%] h-[500px] bg-[#FBE5F6] rounded-full mix-blend-multiply filter blur-[120px] opacity-70 pointer-events-none -z-10" />

      <motion.div 
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="max-w-6xl mx-auto space-y-12 pb-32 pt-8"
      >
        {/* Header Content */}
        <div className="text-center space-y-4 relative z-10 w-full max-w-2xl mx-auto">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold text-[#6C5CE7] bg-[#EEEDFD] rounded-full uppercase tracking-wide border border-[#E0DCFC]">
                <Sparkles className="w-3.5 h-3.5" /> 100% Made for Schools & Colleges to Remove Manual Work
            </span>
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-tight mb-2 text-[#111111]">
              Bulk Result <span className="text-[#6C5CE7]">Fetcher</span>
            </h1>
            <p className="text-[#666666] text-lg font-medium">
              Automate downloading student results. Select your exam, enter the number range, and export to CSV or HTML Marksheets instantly.
            </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Controls Sidebar */}
          <div className="lg:col-span-1 space-y-6">
            
            {/* Exam Selector styled as soft pills */}
            <div className="flex p-1.5 bg-white rounded-2xl max-w-md mx-auto sm:mx-0 shadow-[0_4px_20px_rgb(0,0,0,0.03)] border border-[#EAEAEA]">
               <button
                 onClick={() => setExam('hslc')}
                 className={`flex-1 py-3 px-4 rounded-xl font-bold text-sm transition-all focus:outline-none ${exam === 'hslc' ? 'bg-[#EEEDFD] text-[#6C5CE7] shadow-sm' : 'text-[#888888] hover:text-[#2D334A] hover:bg-[#F8F9FA]'}`}
                 disabled={isFetching}
               >
                 HSLC (10th)
               </button>
               <button
                 onClick={() => setExam('hs')}
                 className={`flex-1 py-3 px-4 rounded-xl font-bold text-sm transition-all focus:outline-none ${exam === 'hs' ? 'bg-[#EEEDFD] text-[#6C5CE7] shadow-sm' : 'text-[#888888] hover:text-[#2D334A] hover:bg-[#F8F9FA]'}`}
                 disabled={isFetching}
               >
                 HS (12th)
               </button>
            </div>

            {/* Config Card styled with soft pastel gradient bg */}
            <div className="bg-gradient-to-br from-[#EAE6FF] via-[#F4F2FF] to-[#FAEEFF] p-6 sm:p-8 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.06)] border border-white relative overflow-hidden">
              <div className="absolute top-0 right-0 p-8 opacity-20 pointer-events-none">
                 <div className="w-32 h-32 bg-white rounded-full mix-blend-overlay filter blur-xl"></div>
              </div>
              <h2 className="text-xl font-bold text-[#111111] mb-6 relative z-10">Configuration</h2>
              <div className="space-y-5">
                <AnimatePresence>
                  {exam === 'hslc' && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden"
                    >
                      <label className="block text-sm font-semibold text-[#555555] mb-1.5">Prefix</label>
                      <input 
                        title="Prefix"
                        type="text" 
                        placeholder="e.g. B26" 
                        value={prefix} 
                        onChange={e => setPrefix(e.target.value)}
                        className="w-full px-4 py-3 bg-white/70 border border-white/50 rounded-xl focus:bg-white focus:ring-2 focus:ring-[#C4BDFC] focus:border-[#6C5CE7] outline-none transition-all font-medium text-[#2D334A] shadow-sm backdrop-blur-sm relative z-10"
                        disabled={isFetching}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
                <div>
                  <label className="block text-sm font-semibold text-[#555555] mb-1.5">Roll Code</label>
                  <input 
                    title="4-digit roll code"
                    type="text" 
                    placeholder="e.g. 1234" 
                    value={rollCode} 
                    onChange={e => setRollCode(e.target.value)}
                    className="w-full px-4 py-3 bg-white border border-[#EAEAEA] rounded-xl focus:ring-2 focus:ring-[#C4BDFC] focus:border-[#6C5CE7] outline-none transition-all font-medium text-[#2D334A] shadow-sm"
                    disabled={isFetching}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-[#555555] mb-1.5">Start No.</label>
                    <input 
                      title="5-digit start roll number"
                      type="text" 
                      placeholder="e.g. 10001" 
                      value={startNo} 
                      onChange={e => setStartNo(e.target.value)}
                      className="w-full px-4 py-3 bg-white border border-[#EAEAEA] rounded-xl focus:ring-2 focus:ring-[#C4BDFC] focus:border-[#6C5CE7] outline-none transition-all font-medium text-[#2D334A] shadow-sm"
                      disabled={isFetching}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-[#555555] mb-1.5">End No.</label>
                    <input 
                      title="5-digit end roll number"
                      type="text" 
                      placeholder="e.g. 10050" 
                      value={endNo} 
                      onChange={e => setEndNo(e.target.value)}
                      className="w-full px-4 py-3 bg-white border border-[#EAEAEA] rounded-xl focus:ring-2 focus:ring-[#C4BDFC] focus:border-[#6C5CE7] outline-none transition-all font-medium text-[#2D334A] shadow-sm"
                      disabled={isFetching}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-[#555555] mb-1.5">
                    Delay (ms)
                  </label>
                  <input 
                    type="number" 
                    placeholder="500" 
                    value={delayStr} 
                    onChange={e => setDelayStr(e.target.value)}
                    className="w-full px-4 py-3 bg-white border border-[#EAEAEA] rounded-xl focus:ring-2 focus:ring-[#C4BDFC] focus:border-[#6C5CE7] outline-none transition-all font-medium text-[#2D334A] shadow-sm"
                    disabled={isFetching}
                  />
                  <p className="text-xs text-[#888888] mt-2 font-medium">Recommended ≥500ms to avoid rate limits.</p>
                </div>
              </div>

              <div className="mt-8 space-y-3">
                 {isFetching ? (
                    <button 
                      onClick={handleStop}
                      className="w-full flex items-center justify-center gap-2 bg-[#FFE3E3] text-[#D83A3A] hover:bg-[#FFD1D1] py-3.5 rounded-xl font-bold transition-all transform active:scale-95 shadow-[0_4px_15px_rgb(216,58,58,0.2)]"
                    >
                      <Square className="w-5 h-5 fill-current" /> Stop Fetching
                    </button>
                  ) : (
                    <button 
                      onClick={handleStart}
                      disabled={!rollCode || !startNo || !endNo}
                      className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-[#6C5CE7] to-[#A29BFE] text-white hover:from-[#5A4AD1] hover:to-[#8C82FD] disabled:opacity-50 disabled:cursor-not-allowed py-3.5 rounded-xl font-bold transition-all shadow-[0_4px_15px_rgb(108,92,231,0.3)] hover:shadow-[0_6px_20px_rgb(108,92,231,0.4)] transform active:scale-95 border border-[#5A4AD1]/50 relative z-10"
                    >
                      <Play className="w-5 h-5 fill-current" /> Start Batch
                    </button>
                 )}
                 
                 <div className="flex gap-2">
                     <button
                        onClick={exportToCSV}
                        disabled={results.length === 0 || isZipping}
                        className="flex-1 flex items-center justify-center gap-1.5 bg-white text-[#2D334A] border border-[#EAEAEA] hover:bg-[#F8F9FA] disabled:opacity-50 disabled:cursor-not-allowed py-3 rounded-xl font-bold transition-all shadow-sm transform active:scale-[0.98] text-sm"
                      >
                        <Download className="w-4 h-4" /> CSV
                     </button>
                     
                     <button
                        onClick={exportToZip}
                        disabled={results.length === 0 || isZipping}
                        className="flex-1 flex items-center justify-center gap-1.5 bg-[#FDF1F9] text-[#D841AF] border border-[#FBE5F6] hover:bg-[#FBE5F6] disabled:opacity-50 disabled:cursor-not-allowed py-3 rounded-xl font-bold transition-all shadow-sm relative overflow-hidden transform active:scale-[0.98] text-sm"
                      >
                        {isZipping ? (
                          <>
                             <Loader2 className="w-4 h-4 animate-spin" /> {zipProgress}%
                             <div 
                               className="absolute bottom-0 left-0 h-1 bg-[#D841AF] transition-all duration-200" 
                               style={{ width: `${zipProgress}%` }}
                             />
                          </>
                        ) : (
                          <>
                             <Archive className="w-4 h-4" /> ZIP HTML
                          </>
                        )}
                     </button>
                 </div>
              </div>
            </div>

            {/* Error Log */}
            <AnimatePresence>
              {errorLog.length > 0 && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="bg-white p-5 rounded-3xl border border-[#FFE3E3] max-h-[300px] overflow-hidden flex flex-col shadow-[0_8px_30px_rgb(216,58,58,0.05)]"
                >
                  <div className="flex items-center gap-2 text-[#D83A3A] font-bold mb-3">
                    <AlertCircle className="w-4 h-4" /> Active Errors
                  </div>
                  <div className="space-y-2 text-sm overflow-y-auto pr-1">
                    {errorLog.map((err, i) => (
                      <div key={i} className="text-[#D83A3A] bg-[#FFF2F2] p-2.5 rounded-lg text-xs font-medium">
                        <span className="font-bold block text-[#B12A2A] mb-0.5">{err.rollNo}</span>
                        {err.error}
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Results Area */}
          <div className="lg:col-span-3">
             <div className="bg-gradient-to-br from-white via-white to-[#F6F8FF] rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.06)] border border-white flex flex-col min-h-[500px] overflow-hidden h-full relative z-10">
              {/* Table Header/Toolbar */}
              <div className="border-b border-[#F0F0FA] p-5 sm:p-6 bg-transparent flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <h3 className="font-bold text-[#111111] text-lg">Results Status</h3>
                  <span className="bg-[#EEEDFD] text-[#6C5CE7] py-1 px-3 rounded-full text-xs font-bold shadow-sm">
                      {results.length} Scraped
                  </span>
                </div>
                {isFetching && (
                    <span className="bg-[#EAF9EE] text-[#29AF57] py-1 px-3 rounded-full text-xs font-bold flex items-center gap-1.5 border border-[#C5F0D3]">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" /> Fetching {currentFetch}... ({progress}%)
                    </span>
                )}
              </div>

            {/* Table Container */}
            <div className="flex-1 overflow-auto bg-transparent">
              {results.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-[#A0A0A0] p-10 text-center">
                  <div className="w-20 h-20 bg-[#F5F7FF] rounded-full flex items-center justify-center mb-5 border border-[#E3E8FF] shadow-sm">
                     <Download className="w-8 h-8 text-[#A0ACFC]" />
                  </div>
                  <p className="text-xl font-extrabold text-[#111111] mb-2">No Records Yet</p>
                  <p className="text-sm max-w-xs font-medium text-[#888888]">Set parameters on the left and click 'Start Batch' to crawl results directly to your table.</p>
                </div>
              ) : (
                <ResultTable results={results} />
              )}
            </div>
          </div>
          </div>
        </div>
      </motion.div>

      {/* EASTER EGG FOOTER */}
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1 }}
        onClick={() => navigate('/vibe')}
        className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 cursor-pointer group"
      >
         <div className="bg-white/80 backdrop-blur-xl px-6 py-3.5 rounded-full shadow-[0_8px_30px_rgb(0,0,0,0.08)] border border-[#EAEAEA] hover:border-[#FBCFE8] transition-all duration-500 hover:-translate-y-1 overflow-hidden relative">
            <div className="absolute inset-0 bg-gradient-to-r from-[#FBCFE8]/20 via-[#C4BDFC]/20 to-[#A0ACFC]/20 transform -translate-x-full group-hover:translate-x-full transition-transform duration-1000 ease-in-out" />
            <p className="text-sm font-bold text-[#666666] flex items-center gap-2 relative z-10 whitespace-nowrap">
              Created with <Heart className="w-4 h-4 text-[#F472B6] fill-[#F472B6] animate-pulse drop-shadow-sm" /> by 
              <a 
                href="https://instagram.com/xavy.dev"
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => { e.stopPropagation(); }}
                className="text-[#6C5CE7] hover:text-[#D841AF] transition-colors ml-0.5 relative after:absolute after:-bottom-0.5 after:left-0 after:w-full after:h-0.5 after:bg-[#D841AF] after:scale-x-0 group-hover:after:scale-x-100 after:transition-transform after:origin-left"
              >
                @xavy.dev
              </a>
            </p>
         </div>
      </motion.div>
    </div>
  );
}

function ResultTable({ results }: { results: ResultRecord[] }) {
  const headersSet = new Set<string>();
  results.forEach(res => {
    Object.keys(res).forEach(k => {
        if (!k.startsWith('_')) headersSet.add(k);
    });
  });
  
  const headers = Array.from(headersSet).sort((a, b) => {
        const order = ['Roll Code', 'Roll Number', 'Name', "Father's Name", "Mother's Name", 'Registration No', 'DOB', 'School', 'Centre Name', 'Result', 'Grand Total'];
        const getIdx = (key: string) => {
            const idx = order.indexOf(key);
            if (idx !== -1) return idx;
            if (key.startsWith('Subject:')) return order.length + 1;
            return 999;
        };
        const intA = getIdx(a);
        const intB = getIdx(b);
        if (intA !== intB) return intA - intB;
        return a.localeCompare(b);
  });

  return (
    <table className="w-full text-left text-sm whitespace-nowrap">
      <thead className="bg-[#F8F9FA] text-[#888888] sticky top-0 z-10">
        <tr>
          {headers.map(header => (
            <th key={header} className="px-5 py-4 font-bold border-b border-[#F0F0F0]">
              {header}
            </th>
          ))}
          <th className="px-5 py-4 font-bold border-b border-[#F0F0F0] text-right sticky right-0 bg-[#F8F9FA] shadow-[-10px_0_15px_-10px_rgba(0,0,0,0.05)]">Action</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-[#F0F0F0]">
        <AnimatePresence>
          {results.map((row, i) => (
            <motion.tr 
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i * 0.05, 0.5) }} 
              key={`${row['Roll Code']}-${row['Roll Number']}-${i}`} 
              className="hover:bg-[#F5F7FF] transition-colors group"
            >
              {headers.map(header => (
                <td key={header} className="px-5 py-4 text-[#2D334A] font-medium">
                  {row[header] || <span className="text-[#CCCCCC]">-</span>}
                </td>
              ))}
              <td className="px-5 py-4 text-right sticky right-0 transition-colors flex items-center justify-end gap-3 h-full bg-white group-hover:bg-[#F5F7FF]">
                <button 
                    onClick={async () => {
                       try {
                           const url = `/api/marksheet-html?exam=${row._exam}&roll=${row['Roll Code']}&no=${row['Roll Number']}` + (row._exam === 'hslc' ? `&prefix=${row['_prefix'] || 'B26'}` : '');
                           const response = await fetch(url);
                           if (response.ok) {
                               const html = await response.text();
                               const printWindow = window.open('', '_blank');
                               if (printWindow) {
                                   printWindow.document.write(html);
                                   printWindow.document.close();
                                   setTimeout(() => {
                                       printWindow.print();
                                   }, 500);
                               }
                           }
                       } catch(e) {}
                    }}
                    className="text-[#888888] hover:text-[#6C5CE7] w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white transition-all shadow-sm opacity-0 group-hover:opacity-100"
                    title="Print"
                  >
                    <Printer className="w-4 h-4" />
                </button>
                <button 
                    onClick={async () => {
                       try {
                           const url = `/api/marksheet-html?exam=${row._exam}&roll=${row['Roll Code']}&no=${row['Roll Number']}` + (row._exam === 'hslc' ? `&prefix=${row['_prefix'] || 'B26'}` : '');
                           const response = await fetch(url);
                           if (response.ok) {
                               const html = await response.text();
                               const blob = new Blob([html], { type: 'text/html' });
                               const link = document.createElement("a");
                               link.href = URL.createObjectURL(blob);
                               link.download = `Marksheet_${row['Roll Code']}_${row['Roll Number']}.html`;
                               document.body.appendChild(link);
                               link.click();
                               document.body.removeChild(link);
                           }
                       } catch(e) {}
                    }}
                    className="text-[#888888] hover:text-[#6C5CE7] w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white transition-all shadow-sm opacity-0 group-hover:opacity-100"
                    title="Download HTML"
                  >
                    <Download className="w-4 h-4" />
                </button>
                {row._sourceUrl && (
                  <a 
                    href={row._sourceUrl} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-[#6C5CE7] hover:text-[#5A4AD1] font-bold flex items-center justify-end gap-1.5 transition-colors text-sm px-3 py-1.5 bg-[#EEEDFD] hover:bg-[#E0DCFC] rounded-lg"
                  >
                    <ExternalLink className="w-3 h-3" /> View Source
                  </a>
                )}
              </td>
            </motion.tr>
          ))}
        </AnimatePresence>
      </tbody>
    </table>
  );
}
