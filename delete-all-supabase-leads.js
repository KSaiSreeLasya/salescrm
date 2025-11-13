const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

async function deleteAllLeads() {
  try {
    console.log('Fetching all lead IDs...');
    const fetchRes = await fetch(
      `${SUPABASE_URL.replace(/\/+$/, '')}/rest/v1/leads?select=id`,
      {
        method: 'GET',
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
        }
      }
    );

    if (!fetchRes.ok) {
      throw new Error(`Failed to fetch leads: ${fetchRes.status}`);
    }

    const leads = await fetchRes.json();
    console.log(`Found ${leads.length} leads to delete`);

    if (leads.length === 0) {
      console.log('No leads to delete');
      return;
    }

    // Delete in batches
    for (let i = 0; i < leads.length; i += 100) {
      const batch = leads.slice(i, i + 100);
      // Format as UUID list without extra quotes
      const ids = batch.map(l => l.id).join(',');

      console.log(`Deleting leads ${i} to ${Math.min(i + 100, leads.length)}...`);
      const deleteRes = await fetch(
        `${SUPABASE_URL.replace(/\/+$/, '')}/rest/v1/leads?id=in.(${ids})`,
        {
          method: 'DELETE',
          headers: {
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`,
          }
        }
      );

      if (!deleteRes.ok) {
        const text = await deleteRes.text();
        console.warn(`Delete request status: ${deleteRes.status}`, text.substring(0, 200));
      } else {
        console.log(`✓ Deleted batch`);
      }
    }

    console.log('✅ All leads deleted from Supabase');
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
}

deleteAllLeads();
