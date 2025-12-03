import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { target_url } = await req.json()
    
    if (!target_url) {
      throw new Error("Missing target_url")
    }

    // 1. Initialize Supabase Client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // 2. Create a Database Record
    const { data: record, error: dbError } = await supabase
      .from('requests')
      .insert({ target_url: target_url })
      .select('id')
      .single()

    if (dbError) throw dbError
    
    const requestId = record.id

    // 3. Trigger GitHub Action
    const GITHUB_TOKEN = Deno.env.get("GITHUB_PAT")!
    const REPO_OWNER = "YOUR_GITHUB_USERNAME" // REPLACE THIS
    const REPO_NAME = "YOUR_REPO_NAME"        // REPLACE THIS

    const ghResponse = await fetch(
      `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/actions/workflows/scout.yml/dispatches`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${GITHUB_TOKEN}`,
          "Accept": "application/vnd.github.v3+json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ref: "main", // Ensure this matches your branch name
          inputs: {
            target_url: target_url,
            request_id: requestId,
          },
        }),
      }
    );

    if (!ghResponse.ok) {
      const errText = await ghResponse.text()
      throw new Error(`GitHub API Error: ${errText}`)
    }

    // 4. Return success
    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Scout dispatched", 
        request_id: requestId 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 400, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})