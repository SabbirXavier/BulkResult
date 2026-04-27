import { useState, useRef } from "react";
import { Download, Play, Square, Loader2, AlertCircle, ExternalLink, Archive, Printer, Heart } from "lucide-react";
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
    <div className="min-h-screen bg-slate-50 text-slate-900 p-6 font-sans relative overflow-x-hidden selection:bg-indigo-500 selection:text-white">
      
      {/* Decorative Background Blob */}
      <div className="absolute top-0 inset-x-0 h-[500px] bg-gradient-to-b from-indigo-100/50 to-transparent pointer-events-none -z-10" />

      <motion.div 
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="max-w-6xl mx-auto space-y-8 pb-32"
      >
        {/* Header Content */}
        <motion.div 
          whileHover={{ scale: 1.01 }}
          transition={{ type: "spring", bounce: 0.4 }}
          className="bg-gradient-to-br from-indigo-600 via-blue-600 to-indigo-800 rounded-3xl shadow-xl p-8 sm:p-10 text-white flex flex-col md:flex-row items-center justify-between relative overflow-hidden"
        >
          {/* Subtle inner glow */}
          <div className="absolute inset-0 bg-white/5 opacity-50 blur-2xl pointer-events-none" />

          <div className="relative z-10 w-full md:w-auto">
            <h1 className="text-4xl font-extrabold tracking-tight mb-2">Bulk Result Fetcher</h1>
            <p className="text-white/80 max-w-xl text-lg font-medium">
              Automate downloading student results. Select your exam, enter the range of numbers and export all compiled results directly to a CSV spreadsheet.
            </p>
          </div>
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="mt-6 md:mt-0 px-6 py-4 bg-white/10 rounded-2xl backdrop-blur-md border border-white/20 min-w-[200px] relative z-10 shadow-inner"
          >
             <div className="text-xs font-bold text-white/70 uppercase tracking-widest text-center mb-1">Status</div>
             <div className="text-3xl font-black tabular-nums text-center drop-shadow-sm">
                {isFetching ? `${progress}%` : (progress === 100 ? "Complete" : "Ready")}
             </div>
          </motion.div>
        </motion.div>

        {/* Exam Type Switcher */}
        <div className="flex p-1.5 bg-white rounded-2xl max-w-md mx-auto sm:mx-0 shadow-sm border border-slate-200">
           <button
             onClick={() => setExam('hslc')}
             className={`flex-1 py-3 px-4 rounded-xl font-bold text-sm transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${exam === 'hslc' ? 'bg-indigo-50 text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'}`}
             disabled={isFetching}
           >
             HSLC (10th) - 10th Apr
           </button>
           <button
             onClick={() => setExam('hs')}
             className={`flex-1 py-3 px-4 rounded-xl font-bold text-sm transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${exam === 'hs' ? 'bg-indigo-50 text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'}`}
             disabled={isFetching}
           >
             HS (12th) - 28th Apr
           </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Controls Sidebar */}
          <div className="lg:col-span-1 space-y-6">
            <div className="bg-white p-6 sm:p-8 rounded-3xl shadow-sm border border-slate-200/60 ring-1 ring-slate-900/5">
              <h2 className="text-xl font-bold text-slate-800 mb-6">Configuration</h2>
              <div className="space-y-5">
                <AnimatePresence>
                  {exam === 'hslc' && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden"
                    >
                      <label className="block text-sm font-semibold text-slate-700 mb-1.5">Prefix</label>
                      <input 
                        title="Prefix"
                        type="text" 
                        placeholder="e.g. B26" 
                        value={prefix} 
                        onChange={e => setPrefix(e.target.value)}
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 outline-none transition-all font-medium text-slate-900 shadow-sm"
                        disabled={isFetching}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Roll Code</label>
                  <input 
                    title="4-digit roll code"
                    type="text" 
                    placeholder="e.g. 1234" 
                    value={rollCode} 
                    onChange={e => setRollCode(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 outline-none transition-all font-medium text-slate-900 shadow-sm"
                    disabled={isFetching}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">Start No.</label>
                    <input 
                      title="5-digit start roll number"
                      type="text" 
                      placeholder="e.g. 10001" 
                      value={startNo} 
                      onChange={e => setStartNo(e.target.value)}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 outline-none transition-all font-medium text-slate-900 shadow-sm"
                      disabled={isFetching}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">End No.</label>
                    <input 
                      title="5-digit end roll number"
                      type="text" 
                      placeholder="e.g. 10050" 
                      value={endNo} 
                      onChange={e => setEndNo(e.target.value)}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 outline-none transition-all font-medium text-slate-900 shadow-sm"
                      disabled={isFetching}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                    Delay (ms)
                  </label>
                  <input 
                    type="number" 
                    placeholder="500" 
                    value={delayStr} 
                    onChange={e => setDelayStr(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 outline-none transition-all font-medium text-slate-900 shadow-sm"
                    disabled={isFetching}
                  />
                  <p className="text-xs text-slate-500 mt-2 font-medium">Recommended ≥500ms to avoid rate limits.</p>
                </div>
              </div>

              <div className="mt-8 space-y-3">
                 {isFetching ? (
                    <button 
                      onClick={handleStop}
                      className="w-full flex items-center justify-center gap-2 bg-rose-100 text-rose-700 hover:bg-rose-200 py-3.5 rounded-xl font-bold transition-all transform active:scale-95 shadow-sm"
                    >
                      <Square className="w-5 h-5 fill-current" /> Stop Fetching
                    </button>
                 ) : (
                    <button 
                      onClick={handleStart}
                      disabled={!rollCode || !startNo || !endNo}
                      className="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed py-3.5 rounded-xl font-bold transition-all shadow-md hover:shadow-lg transform active:scale-95 border border-indigo-700/50"
                    >
                      <Play className="w-5 h-5 fill-current" /> Start Batch
                    </button>
                 )}

                 <button
                    onClick={exportToCSV}
                    disabled={results.length === 0 || isZipping}
                    className="w-full flex items-center justify-center gap-2 bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed py-3.5 rounded-xl font-bold transition-all shadow-sm transform active:scale-95"
                  >
                    <Download className="w-5 h-5" /> Export to CSV
                 </button>
                 
                 <button
                    onClick={exportToZip}
                    disabled={results.length === 0 || isZipping}
                    className="w-full flex items-center justify-center gap-2 bg-violet-50 text-violet-700 border border-violet-200 hover:bg-violet-100 hover:border-violet-300 disabled:opacity-50 disabled:cursor-not-allowed py-3.5 rounded-xl font-bold transition-all shadow-sm relative overflow-hidden transform active:scale-95"
                  >
                    {isZipping ? (
                      <>
                         <Loader2 className="w-5 h-5 animate-spin" /> Zipping... {zipProgress}%
                         <div 
                           className="absolute bottom-0 left-0 h-1.5 bg-violet-500 transition-all duration-200" 
                           style={{ width: `${zipProgress}%` }}
                         />
                      </>
                    ) : (
                      <>
                         <Archive className="w-5 h-5" /> Bulk Download HTML
                      </>
                    )}
                 </button>
              </div>
            </div>

            {/* Error Log */}
            <AnimatePresence>
              {errorLog.length > 0 && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className="bg-rose-50 p-6 rounded-3xl border border-rose-100 max-h-[300px] overflow-y-auto scrollbar-thin scrollbar-thumb-rose-200 shadow-sm"
                >
                  <div className="flex items-center gap-2 text-rose-800 font-bold mb-4">
                    <AlertCircle className="w-5 h-5" /> Active Errors
                  </div>
                  <div className="space-y-2 text-sm">
                    {errorLog.map((err, i) => (
                      <div key={i} className="text-rose-700 bg-white p-3 rounded-lg border border-rose-100 shadow-sm">
                        <span className="font-bold text-rose-900 block mb-0.5">{err.rollNo}:</span> {err.error}
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Results Area */}
          <div className="lg:col-span-3 bg-white rounded-3xl shadow-sm border border-slate-200/60 ring-1 ring-slate-900/5 flex flex-col min-h-[500px] overflow-hidden">
            {/* Table Header/Toolbar */}
            <div className="border-b border-slate-100 p-5 sm:p-6 bg-slate-50/50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
                  Scraped Records
                  <span className="bg-indigo-100 text-indigo-700 py-0.5 px-2.5 rounded-full text-xs font-extrabold">{results.length}</span>
                </h3>
                {currentFetch && (
                  <p className="text-sm text-indigo-600 font-semibold mt-1 flex items-center gap-1.5 animate-pulse">
                    <Loader2 className="w-3.5 h-3.5 animate-spin"/> Fetching {currentFetch}...
                  </p>
                )}
              </div>
            </div>

            {/* Table Container */}
            <div className="flex-1 overflow-auto bg-white">
              {results.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-400 p-10 text-center">
                  <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mb-5 border border-slate-100">
                     <Download className="w-10 h-10 text-slate-300" />
                  </div>
                  <p className="text-xl font-bold text-slate-600">No records yet</p>
                  <p className="text-sm mt-2 max-w-sm font-medium text-slate-500">Configure your parameters on the left and hit 'Start Batch' to see the magic happen.</p>
                </div>
              ) : (
                <ResultTable results={results} />
              )}
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
         <div className="bg-white/70 backdrop-blur-md px-6 py-3 rounded-full shadow-lg border border-white hover:border-fuchsia-200 transition-all duration-500 hover:shadow-fuchsia-500/20 hover:scale-105 overflow-hidden relative">
            <div className="absolute inset-0 bg-gradient-to-r from-fuchsia-100/0 via-fuchsia-400/10 to-cyan-400/10 transform translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000 ease-in-out" />
            <p className="text-sm font-semibold text-slate-700 flex items-center gap-2 relative z-10 whitespace-nowrap">
              Created with <Heart className="w-4 h-4 text-rose-500 fill-rose-500 animate-pulse" /> by 
              <span 
                onClick={(e) => { e.stopPropagation(); window.open('https://instagram.com/xavy.dev', '_blank'); }}
                className="text-fuchsia-600 font-bold hover:text-cyan-600 transition-colors ml-0.5 relative after:absolute after:bottom-0 after:left-0 after:w-full after:h-0.5 after:bg-cyan-500 after:scale-x-0 group-hover:after:scale-x-100 after:transition-transform after:origin-left"
              >
                @xavy.dev
              </span>
            </p>
         </div>
      </motion.div>
    </div>
  );
}

function ResultTable({ results }: { results: ResultRecord[] }) {
  // Extract all unique headers
  const headersSet = new Set<string>();
  results.forEach(res => {
    Object.keys(res).forEach(k => {
        if (!k.startsWith('_')) headersSet.add(k);
    });
  });
  
  // Prioritize some headers
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
      <thead className="bg-slate-50/80 text-slate-600 sticky top-0 backdrop-blur-sm z-10 shadow-sm">
        <tr>
          {headers.map(header => (
            <th key={header} className="px-4 py-3.5 font-bold border-b border-slate-200">
              {header}
            </th>
          ))}
          <th className="px-4 py-3.5 font-bold border-b border-slate-200 text-right sticky right-0 bg-slate-50/80 backdrop-blur-sm">Action</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        <AnimatePresence>
          {results.map((row, i) => (
            <motion.tr 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i * 0.05, 0.5) }} 
              key={`${row['Roll Code']}-${row['Roll Number']}-${i}`} 
              className="hover:bg-indigo-50/50 transition-colors group"
            >
              {headers.map(header => (
                <td key={header} className="px-4 py-3.5 text-slate-700 font-medium">
                  {row[header] || <span className="text-slate-300">-</span>}
                </td>
              ))}
              <td className="px-4 py-3.5 text-right sticky right-0 opacity-100 transition-colors flex items-center justify-end gap-3 h-full bg-white group-hover:bg-indigo-50/50">
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
                                   }, 500); // give it half a second to load CSS
                               } else {
                                   alert("Please allow popups to print.");
                               }
                           } else {
                               alert("Failed to fetch HTML format");
                           }
                       } catch(e) {
                           alert("Error: " + e);
                       }
                    }}
                    className="text-slate-500 hover:text-indigo-600 text-sm font-bold flex items-center justify-end gap-1.5 transition-colors"
                  >
                    <Printer className="w-4 h-4" /> Print
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
                               link.download = `Marksheet_${row['Roll Code']}_row['Roll Number'].html`;
                               document.body.appendChild(link);
                               link.click();
                               document.body.removeChild(link);
                           } else {
                               alert("Failed to fetch HTML format");
                           }
                       } catch(e) {
                           alert("Error: " + e);
                       }
                    }}
                    className="text-slate-500 hover:text-indigo-600 text-sm font-bold flex items-center justify-end gap-1.5 transition-colors"
                  >
                    <Download className="w-4 h-4" /> Download
                </button>
                {row._sourceUrl && (
                  <a 
                    href={row._sourceUrl} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-indigo-500 hover:text-indigo-700 text-sm font-bold flex items-center justify-end gap-1.5 transition-colors"
                  >
                    <ExternalLink className="w-4 h-4" /> View
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
