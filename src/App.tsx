import { useState, useRef } from "react";
import { Download, Play, Square, Loader2, AlertCircle, ExternalLink, Archive, Printer } from "lucide-react";
import JSZip from "jszip";
import { saveAs } from "file-saver";

type ResultRecord = Record<string, string>;

export default function App() {
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
    <div className="min-h-screen bg-gray-50 text-gray-900 p-6 font-sans">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header Content */}
        <div className="bg-blue-600 rounded-2xl shadow-lg p-8 text-white flex flex-col md:flex-row items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Bulk Result Fetcher</h1>
            <p className="opacity-90 mt-2 max-w-xl">
              Automate downloading student results. Select your exam, enter the range of numbers and export all compiled results directly to a CSV spreadsheet.
            </p>
          </div>
          <div className="mt-6 md:mt-0 px-4 py-3 bg-blue-700/50 rounded-xl backdrop-blur-sm border border-blue-500/50 min-w-[200px]">
             <div className="text-sm font-medium opacity-80 uppercase tracking-widest text-center">Status</div>
             <div className="text-2xl font-bold tabular-nums text-center">
                {isFetching ? `${progress}%` : (progress === 100 ? "Complete" : "Ready")}
             </div>
          </div>
        </div>

        {/* Exam Type Switcher */}
        <div className="flex p-1 bg-gray-200 rounded-xl max-w-md mx-auto sm:mx-0 shadow-inner">
           <button
             onClick={() => setExam('hslc')}
             className={`flex-1 py-2.5 px-4 rounded-lg font-medium text-sm transition-all shadow-sm ${exam === 'hslc' ? 'bg-white text-blue-600 shadow' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'}`}
             disabled={isFetching}
           >
             HSLC (10th) - 10th Apr
           </button>
           <button
             onClick={() => setExam('hs')}
             className={`flex-1 py-2.5 px-4 rounded-lg font-medium text-sm transition-all shadow-sm ${exam === 'hs' ? 'bg-white text-blue-600 shadow' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'}`}
             disabled={isFetching}
           >
             HS (12th) - 28th Apr
           </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Controls Sidebar */}
          <div className="lg:col-span-1 space-y-6">
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
              <h2 className="text-lg font-semibold mb-4">Configuration</h2>
              <div className="space-y-4">
                {exam === 'hslc' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Prefix</label>
                    <input 
                      title="Prefix"
                      type="text" 
                      placeholder="e.g. B26" 
                      value={prefix} 
                      onChange={e => setPrefix(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                      disabled={isFetching}
                    />
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Roll Code</label>
                  <input 
                    title="4-digit roll code"
                    type="text" 
                    placeholder="e.g. 1234" 
                    value={rollCode} 
                    onChange={e => setRollCode(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                    disabled={isFetching}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Start No.</label>
                    <input 
                      title="5-digit start roll number"
                      type="text" 
                      placeholder="e.g. 10001" 
                      value={startNo} 
                      onChange={e => setStartNo(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                      disabled={isFetching}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">End No.</label>
                    <input 
                      title="5-digit end roll number"
                      type="text" 
                      placeholder="e.g. 10050" 
                      value={endNo} 
                      onChange={e => setEndNo(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                      disabled={isFetching}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Delay (ms)
                  </label>
                  <input 
                    type="number" 
                    placeholder="500" 
                    value={delayStr} 
                    onChange={e => setDelayStr(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                    disabled={isFetching}
                  />
                  <p className="text-xs text-gray-500 mt-1">Recommended ≥500ms to avoid rate limits.</p>
                </div>
              </div>

              <div className="mt-8 space-y-3">
                 {isFetching ? (
                    <button 
                      onClick={handleStop}
                      className="w-full flex items-center justify-center gap-2 bg-red-100 text-red-700 hover:bg-red-200 py-3 rounded-xl font-semibold transition-colors"
                    >
                      <Square className="w-5 h-5 fill-current" /> Stop Fetching
                    </button>
                 ) : (
                    <button 
                      onClick={handleStart}
                      disabled={!rollCode || !startNo || !endNo}
                      className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed py-3 rounded-xl font-semibold transition-colors shadow-sm hover:shadow"
                    >
                      <Play className="w-5 h-5 fill-current" /> Start Batch
                    </button>
                 )}

                 <button
                    onClick={exportToCSV}
                    disabled={results.length === 0 || isZipping}
                    className="w-full flex items-center justify-center gap-2 bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed py-3 rounded-xl font-semibold transition-colors shadow-sm"
                  >
                    <Download className="w-5 h-5" /> Export to CSV
                 </button>
                 
                 <button
                    onClick={exportToZip}
                    disabled={results.length === 0 || isZipping}
                    className="w-full flex items-center justify-center gap-2 bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 disabled:opacity-50 disabled:cursor-not-allowed py-3 rounded-xl font-semibold transition-colors shadow-sm relative overflow-hidden"
                  >
                    {isZipping ? (
                      <>
                         <Loader2 className="w-5 h-5 animate-spin" /> Zipping... {zipProgress}%
                         <div 
                           className="absolute bottom-0 left-0 h-1 bg-indigo-500 transition-all duration-200" 
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
            {errorLog.length > 0 && (
              <div className="bg-red-50 p-5 rounded-2xl border border-red-100 max-h-[300px] overflow-y-auto">
                <div className="flex items-center gap-2 text-red-800 font-medium mb-3">
                  <AlertCircle className="w-5 h-5" /> Active Errors
                </div>
                <div className="space-y-2">
                  {errorLog.map((err, i) => (
                    <div key={i} className="text-sm text-red-700 bg-red-100/50 p-2 rounded relative">
                      <span className="font-semibold block">{err.rollNo}:</span> {err.error}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Results Area */}
          <div className="lg:col-span-3 bg-white rounded-2xl shadow-sm border border-gray-200 flex flex-col min-h-[500px] overflow-hidden">
            {/* Table Header/Toolbar */}
            <div className="border-b border-gray-200 p-4 bg-gray-50/50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h3 className="font-semibold text-lg">Scraped Records</h3>
                <p className="text-sm text-gray-500">
                  {results.length} successfully fetched 
                  {currentFetch && <span className="ml-2 animate-pulse text-blue-600 inline-flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin"/> Fetching {currentFetch}...</span>}
                </p>
              </div>
            </div>

            {/* Table Container */}
            <div className="flex-1 overflow-auto">
              {results.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-gray-400 p-8 text-center bg-gray-50/30">
                  <Download className="w-12 h-12 mb-4 opacity-20" />
                  <p className="text-lg font-medium">No results fetched yet</p>
                  <p className="text-sm mt-1 max-w-sm">Enter the Roll Code and Number range, then hit 'Start Batch' to begin populating this table.</p>
                </div>
              ) : (
                <ResultTable results={results} />
              )}
            </div>
          </div>
        </div>
      </div>
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
      <thead className="bg-gray-100/80 text-gray-600 sticky top-0 backdrop-blur-sm z-10 shadow-sm">
        <tr>
          {headers.map(header => (
            <th key={header} className="px-4 py-3 font-semibold border-b border-gray-200">
              {header}
            </th>
          ))}
          <th className="px-4 py-3 font-semibold border-b border-gray-200 text-right sticky right-0 bg-gray-100/80 backdrop-blur-sm">Action</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100">
        {results.map((row, i) => (
          <tr key={i} className="hover:bg-blue-50/50 transition-colors">
            {headers.map(header => (
              <td key={header} className="px-4 py-3 text-gray-700">
                {row[header] || <span className="text-gray-300">-</span>}
              </td>
            ))}
            <td className="px-4 py-3 text-right sticky right-0 opacity-90 transition-colors flex items-center justify-end gap-3 h-full bg-white">
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
                  className="text-gray-600 hover:text-indigo-600 text-sm font-semibold flex items-center justify-end gap-1.5"
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
                             link.download = `Marksheet_${row['Roll Code']}_${row['Roll Number']}.html`;
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
                  className="text-gray-600 hover:text-indigo-600 text-sm font-semibold flex items-center justify-end gap-1.5"
                >
                  <Download className="w-4 h-4" /> Download
              </button>
              {row._sourceUrl && (
                <a 
                  href={row._sourceUrl} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-800 text-sm font-semibold flex items-center justify-end gap-1.5"
                >
                  <ExternalLink className="w-4 h-4" /> View
                </a>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
