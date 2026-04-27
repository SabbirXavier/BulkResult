import express from "express";
import { createServer as createViteServer } from "vite";
import axios from "axios";
import * as cheerio from "cheerio";
import path from "path";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Route to scrape result
  app.get("/api/scrape", async (req, res) => {
    try {
      const { exam, roll, no, prefix } = req.query;
      
      if (!roll || !no || !exam) {
        return res.status(400).json({ error: "Exam, Roll Code, and Roll Number are required" });
      }

      let url = "";
      if (exam === "hs") {
        url = `https://iresults.net/assam/12/view.php?roll=${roll}&no=${no}`;
      } else if (exam === "hslc") {
        url = `https://iresults.net/assam/10/view.php?prefix=${prefix}&roll=${roll}&no=${no}`;
      } else {
        return res.status(400).json({ error: "Invalid exam type" });
      }

      // Fetch the result
      const response = await axios.get(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
        },
        timeout: 10000 // 10 second timeout
      });

      const html = response.data;
      const $ = cheerio.load(html);
      const result: Record<string, string> = {};
      
      let currentSubject = '';

      $('table').each((i, table) => {
          const isMarkDetails = $(table).hasClass('mark-details');
          
          if (isMarkDetails) {
             $(table).find('tr').each((j, row) => {
                if ($(row).hasClass('mark-head')) return;

                const tds = $(row).find('td');
                if (tds.length === 0) return;

                // Check for Grand Total
                if (tds.length >= 4 && $(tds[0]).text().trim().includes('Grand Total')) {
                   // Typically: <td colspan="2">Grand Total</td><td>600</td><td>180</td><td>461</td><td>*</td>
                   result['Grand Total'] = $(tds[3]).text().trim();
                   return;
                }
                
                // Check for Result
                if (tds.length === 2 && $(tds[0]).text().trim() === 'Result') {
                   result['Result'] = $(tds[1]).text().trim();
                   return;
                }

                // Check for subject name with rowspan
                const firstTdText = $(tds[0]).text().trim();
                if ($(tds[0]).attr('rowspan')) {
                   currentSubject = firstTdText;
                }
                
                // Track 'Total' for subjects
                if (tds.length >= 4 && firstTdText === 'Total') {
                   // Structure: <td>Total</td><td>100</td><td>30</td><td style="font-weight: 700;">86</td>
                   const obtained = $(tds[3]).text().trim();
                   if (currentSubject) {
                       // Clean up subject name (e.g. "FIRST LANGUAGE : MANIPURI" to "MANIPURI")
                       const cleanName = currentSubject.split(':').pop()?.trim() || currentSubject;
                       result[`Subject: ${cleanName}`] = obtained;
                   }
                }
             });
          } else {
             // General personal info scanning
             $(table).find('tr').each((j, row) => {
                 const tds = $(row).find('td, th');
                 
                 // Type A: <td><strong>Key</strong></td><td>Value</td><td><strong>Key</strong></td><td>Value</td>
                 for (let k = 0; k < tds.length; k += 2) {
                     const keyNode = $(tds[k]).find('strong, b');
                     if (keyNode.length > 0 && k + 1 < tds.length) {
                         const key = keyNode.text().trim().replace(/:$/, '');
                         const val = $(tds[k+1]).text().trim();
                         if (key && val) {
                             result[key] = val;
                         }
                     }
                 }
             });
          }
      });

      // Strategy 2: Extract bold/strong labels if table parsing failed to yield much
      if (Object.keys(result).length < 3) {
          $('b, strong').each((i, el) => {
              const key = $(el).text().trim().replace(/:$/, '');
              // Get following text node or element text
              let nextNode = el.nextSibling;
              let val = '';
              while (nextNode && nextNode.nodeType === 3) { // Text node
                val += nextNode.nodeValue;
                nextNode = nextNode.nextSibling;
              }
              if (val.trim()) {
                  result[key] = val.trim();
              }
          });
      }

      // Explicit inputs
      $('input[type="text"]').each((i, el) => {
          const name = $(el).attr('name') || $(el).attr('id');
          const value = $(el).val();
          if (name && value) {
              result[name] = String(value).trim();
          }
      });

      // Simple error checking
      const fullText = $('body').text();
      let isError = /invalid|not found|no result/i.test(fullText) || /Result not declared yet/i.test(fullText);

      // Extract specific error mapping
      let errorReason = isError ? "Result not found or invalid" : undefined;
      
      // Look for the ERROR! block
      if (/ERROR!/i.test(fullText) && /correct.*Roll Code/i.test(fullText)) {
          isError = true;
          errorReason = "Invalid Roll Code or Number";
      } else if (/Result not declared yet/i.test(fullText)) {
          isError = true;
          errorReason = "Result not declared yet";
      }

      // If we didn't extract any meaningful data, it's also probably an error/landing page
      const hasMeaningfulData = !!(result['Name'] || result['Result'] || result['Centre Name'] || Object.keys(result).some(k => k.startsWith('Subject:')));
      
      if (!hasMeaningfulData) {
          isError = true;
          errorReason = errorReason || "No result data found on page (check inputs)";
          // Clear any scraped garbage metrics
          Object.keys(result).forEach(k => delete result[k]);
      }

      // Add identifiers back into the response
      result['Roll Code'] = String(roll);
      result['Roll Number'] = String(no);
      result['_exam'] = String(exam);
      if (prefix) result['_prefix'] = String(prefix);

      res.json({
        success: !isError,
        data: result,
        url: url,
        isError,
        error: errorReason
      });

    } catch (error: any) {
      console.error(error);
      res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }
  });

  // API Route to fetch raw HTML of a marksheet (for download/saving)
  app.get("/api/marksheet-html", async (req, res) => {
    try {
      const { exam, roll, no, prefix } = req.query;
      
      if (!roll || !no || !exam) {
        return res.status(400).send("Exam, Roll Code, and Roll Number are required");
      }

      let url = "";
      if (exam === "hs") {
        url = `https://iresults.net/assam/12/view.php?roll=${roll}&no=${no}`;
      } else if (exam === "hslc") {
        url = `https://iresults.net/assam/10/view.php?prefix=${prefix}&roll=${roll}&no=${no}`;
      } else {
        return res.status(400).send("Invalid exam type");
      }

      const response = await axios.get(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
        }
      });

      let html = response.data;
      
      // Rewrite relative URLs to absolute so the saved HTML loads CSS and Images correctly
      html = html.replace(/(href|src)="(\/[^"]+)"/ig, '$1="https://iresults.net$2"');

      // Set content type and return
      res.setHeader('Content-Type', 'text/html');
      res.send(html);

    } catch (error: any) {
      console.error("HTML fetch error:", error.message);
      res.status(500).send("Failed to fetch HTML: " + error.message);
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
