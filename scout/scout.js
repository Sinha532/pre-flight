const puppeteer = require('puppeteer');
const { createClient } = require('@supabase/supabase-js');

// Environment Variables passed from GitHub Secrets
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TARGET_URL = process.env.TARGET_URL;
const REQUEST_ID = process.env.REQUEST_ID;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

(async () => {
  console.log(`🚀 Starting Scout for Request ID: ${REQUEST_ID}`);
  console.log(`🎯 Target: ${TARGET_URL}`);

  let browser;
  try {
    // Update DB status to SCOUTING
    await supabase.from('requests').update({ status: 'SCOUTING' }).eq('id', REQUEST_ID);

    browser = await puppeteer.launch({ headless: "new" });
    const page = await browser.newPage();
    
    // Set a realistic User Agent to avoid bot detection
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');

    // Navigate with a generous timeout
    await page.goto(TARGET_URL, { waitUntil: 'networkidle2', timeout: 45000 });

    // Extract the "Automation DOM"
    const simplifiedDOM = await page.evaluate(() => {
      // Helper: Keep only attributes useful for selectors
      const cleanAttrs = (el) => {
        const kept = ['id', 'class', 'name', 'type', 'placeholder', 'aria-label', 'role', 'href', 'title', 'alt'];
        const acc = {};
        for (const attr of el.attributes) {
          if (kept.includes(attr.name) || attr.name.startsWith('data-') || attr.name.startsWith('test-')) {
            acc[attr.name] = attr.value;
          }
        }
        return acc;
      };

      // Select interactive elements
      const elements = document.querySelectorAll('button, a, input, select, textarea, [role="button"], [onclick]');
      
      const map = [];
      elements.forEach((el) => {
        // Skip invisible elements
        if (el.offsetParent === null) return;
        
        let text = el.innerText || el.value || '';
        text = text.substring(0, 50).replace(/\n/g, ' ').trim(); 

        map.push({
          tag: el.tagName.toLowerCase(),
          text: text,
          attributes: cleanAttrs(el)
        });
      });
      return map; // Returns array of objects
    });

    console.log(`✅ Extraction Complete. Found ${simplifiedDOM.length} elements.`);

    // Push Result to Supabase
    const { error } = await supabase
      .from('requests')
      .update({ 
        scout_data: simplifiedDOM, 
        status: 'SCOUT_COMPLETE' 
      })
      .eq('id', REQUEST_ID);

    if (error) throw error;
    console.log("💾 Data saved to Supabase.");

  } catch (error) {
    console.error("❌ Scout Failed:", error);
    await supabase
      .from('requests')
      .update({ status: 'FAILED', scout_data: { error: error.message } })
      .eq('id', REQUEST_ID);
    process.exit(1);
  } finally {
    if (browser) await browser.close();
  }
})();